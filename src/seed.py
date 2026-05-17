import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Protocol
from src.coding import map_to_icd10

import requests

from src.extract import extract_trial_data
from src.graph import GraphManager
from src.logging_config import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

MAX_WORKERS = 3
REQUEST_TIMEOUT = 30
LLM_TIMEOUT = 150


@dataclass
class TrialRecord:
    trial_id: str
    title: str
    description: str
    phase: str | None = None
    status: str | None = None


class TrialSource(Protocol):
    def fetch(self, limit: int) -> list[TrialRecord]: ...


class ClinicalTrialsGovSource:
    BASE_URL = "https://clinicaltrials.gov/api/v2/studies"

    def fetch(self, limit: int) -> list[TrialRecord]:
        logger.info("[ClinicalTrials.gov] Fetching %d trials...", limit)
        response = requests.get(
            self.BASE_URL,
            params={"format": "json", "pageSize": limit, "query.term": "recruiting"},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()

        records = []
        for study in response.json().get("studies", []):
            record = self._parse_study(study)
            if record:
                records.append(record)

        logger.info("[ClinicalTrials.gov] Parsed %d usable records.", len(records))
        return records

    @staticmethod
    def _parse_study(study: dict) -> TrialRecord | None:
        protocol = study.get("protocolSection", {})
        id_module = protocol.get("identificationModule", {})
        nct_id = id_module.get("nctId", "UNKNOWN")
        title = id_module.get("officialTitle") or id_module.get(
            "briefTitle", "Untitled"
        )

        conditions = protocol.get("conditionsModule", {}).get("conditions", [])
        conditions_str = ", ".join(conditions) if conditions else "Not specified"

        interventions = protocol.get("armsInterventionsModule", {}).get(
            "interventions", []
        )
        drug_names = [
            i.get("name", "")
            for i in interventions
            if i.get("type", "").upper()
            in ("DRUG", "BIOLOGICAL", "COMBINATION_PRODUCT")
        ]
        medications_str = (
            ", ".join(filter(None, drug_names)) if drug_names else "Not specified"
        )

        elig = protocol.get("eligibilityModule", {})
        min_age = elig.get("minimumAge", "Not specified")
        max_age = elig.get("maximumAge", "Not specified")
        gender = elig.get("sex", "ALL")
        criteria_text = elig.get("eligibilityCriteria", "")

        desc_module = protocol.get("descriptionModule", {})
        detail = desc_module.get("detailedDescription") or desc_module.get(
            "briefSummary", ""
        )

        if not criteria_text and not detail:
            logger.warning("[ClinicalTrials.gov] Skipping %s — no usable text.", nct_id)
            return None

        phases = protocol.get("designModule", {}).get("phases", [])
        phase = phases[0] if phases else None  # e.g. "PHASE3"
        status = protocol.get("statusModule", {}).get("overallStatus")  # e.g. "RECRUITING"
        structured_text = f"""Trial Title: {title}

            Conditions Being Studied: {conditions_str}

            Medications / Interventions: {medications_str}

            Patient Eligibility:
            - Minimum Age: {min_age}
            - Maximum Age: {max_age}
            - Gender: {gender}

            Eligibility Criteria:
            {criteria_text}

            Study Description:
            {detail}"""

        return TrialRecord(
            trial_id=nct_id,
            title=title,
            description=structured_text,
            phase=phase,
            status=status,
        )


def _process_trial(record: TrialRecord, gm: GraphManager) -> tuple[str, bool, str]:
    try:
        extracted_data = extract_trial_data(record.description)
        # Enrich all conditions with ICD-10 codes before storing in the graph
        for condition in (
            extracted_data.conditions_treated + extracted_data.conditions_excluded
        ):
            condition.icd10_code = map_to_icd10(condition.name)
        gm.ingest_trial(trial_id=record.trial_id, extracted_data=extracted_data, phase=record.phase, status=record.status)
        return record.trial_id, True, "OK"
    except Exception as e:
        return record.trial_id, False, str(e)


def seed_live_trials(limit: int = 10, sources: list[TrialSource] | None = None):
    if sources is None:
        sources = [ClinicalTrialsGovSource()]

    all_records: list[TrialRecord] = []
    for source in sources:
        try:
            all_records.extend(source.fetch(limit))
        except Exception as e:
            logger.error("Failed to fetch from %s: %s", type(source).__name__, e)

    if not all_records:
        logger.warning("No records fetched. Exiting.")
        return

    logger.info("Processing %d total records...", len(all_records))

    gm = GraphManager()
    success_count = 0
    failure_count = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(_process_trial, r, gm): r for r in all_records}
        for future in as_completed(futures):
            try:
                trial_id, success, message = future.result(timeout=LLM_TIMEOUT)
                if success:
                    success_count += 1
                    logger.info("SUCCESS  %s", trial_id)
                else:
                    failure_count += 1
                    logger.warning("FAILED   %s — %s", trial_id, message)
            except TimeoutError:
                failure_count += 1
                logger.warning("TIMEOUT — trial exceeded %ds.", LLM_TIMEOUT)

    logger.info(
        "Seeding complete. Succeeded: %d | Failed: %d | Total: %d",
        success_count,
        failure_count,
        len(all_records),
    )


if __name__ == "__main__":
    seed_live_trials(limit=100)

    # After seeding, re-run watchlist so saved profiles see new trials
    from src.watchlist import WatchlistManager
    from src.agent import app as agent_graph

    _gm = GraphManager()
    try:
        _wm = WatchlistManager(_gm.driver)
        _profiles = _wm.list_profiles()
        if _profiles:
            logger.info(
                "Re-running watchlist for %d saved profile(s)...", len(_profiles)
            )
            _results = _wm.run_all(agent_graph.invoke)
            _new_total = sum(len(r.get("new_matches", [])) for r in _results)
            logger.info(
                "Watchlist re-run complete — %d new match(es) found.", _new_total
            )
        else:
            logger.info("No watchlist profiles saved — skipping re-run.")
    finally:
        _gm.close()
