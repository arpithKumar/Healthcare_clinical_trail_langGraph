import asyncio
import csv
import datetime
import io
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import (
    APIRouter,
    File,
    HTTPException,
    Query as QueryParam,
    Response,
    UploadFile,
)
from fastapi.responses import StreamingResponse

from src.agent import GraphState, MAX_RETRIES
from src.agent import app as agent_app
from src.dependencies import (
    cache_get,
    cache_set,
    graph_manager,
    make_cache_key,
)
from src.interactions import get_interaction_texts, warnings_for_trial
from src.models import BatchMatchResult, FhirBundle, MatchResponse, PatientQuery

logger = logging.getLogger(__name__)

router = APIRouter()

BATCH_MAX_ROWS = 50
BATCH_LLM_TIMEOUT = 150  # seconds per patient

_NODE_LABELS: dict[str, str] = {
    "analyze_query": "Analyzing patient profile",
    "generate_cypher": "Generating Cypher query",
    "execute_query": "Searching Neo4j",
    "score_matches": "Scoring trial matches",
    "evaluate_results": "Evaluating matches",
}

_MEDS_RE = re.compile(r"Medications?:\s*(.+)", re.IGNORECASE)


# ── FHIR parser ───────────────────────────────────────────────────────────────


def _parse_fhir_bundle(bundle: FhirBundle) -> str:
    resources = [e.get("resource", {}) for e in bundle.entry]
    patient = next((r for r in resources if r.get("resourceType") == "Patient"), {})

    age_str = "unknown age"
    birth_date_raw: str | None = patient.get("birthDate")
    if birth_date_raw:
        try:
            bd = datetime.date.fromisoformat(birth_date_raw)
            today = datetime.date.today()
            age = today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
            age_str = f"{age}yo"
        except ValueError:
            logger.warning("Could not parse FHIR birthDate: %s", birth_date_raw)

    gender_raw: str = patient.get("gender", "")
    gender = (
        gender_raw.lower()
        if gender_raw.lower() in ("male", "female")
        else "unknown gender"
    )

    conditions = [
        r["code"]["text"]
        for r in resources
        if r.get("resourceType") == "Condition"
        and isinstance(r.get("code"), dict)
        and r["code"].get("text")
    ]

    medication_rt = {"MedicationStatement", "MedicationRequest"}
    medications: list[str] = []
    for r in resources:
        if r.get("resourceType") in medication_rt:
            med = r.get("medicationCodeableConcept", {})
            text = med.get("text") or (med.get("coding") or [{}])[0].get("display")
            if text:
                medications.append(text)

    parts = [f"{age_str} {gender}"]
    parts.append(
        f"with {', '.join(conditions)}"
        if conditions
        else "with no specific conditions listed"
    )
    if medications:
        parts.append(f"currently taking {', '.join(medications)}")

    query = " ".join(parts) + "."
    logger.info("Parsed FHIR bundle → patient query: %s", query)
    return query


# ── Interaction enrichment ────────────────────────────────────────────────────


def _extract_patient_meds(analyzed_profile: str) -> list[str]:
    """Parse the 'Medications: ...' line from the LLM-analyzed profile."""
    m = _MEDS_RE.search(analyzed_profile)
    if not m:
        return []
    meds_str = m.group(1).strip()
    if meds_str.lower() in ("none", "unknown", "not specified", "n/a", ""):
        return []
    return [med.strip().lower() for med in meds_str.split(",") if med.strip()]


def _enrich_with_interactions(
    scored: list[dict], analyzed_profile: str
) -> tuple[list[dict], list[str]]:
    """Enrich each scored trial dict with per-trial interaction_warnings.

    Also returns a deduplicated flat list of all warnings for MatchResponse.
    Never raises — failures are logged and the original scored list is returned unchanged.
    """
    try:
        patient_meds = _extract_patient_meds(analyzed_profile)
        if not patient_meds or not scored:
            return scored, []
        trial_ids = [t.get("trial_id", "") for t in scored if t.get("trial_id")]
        if not trial_ids:
            return scored, []
        trial_meds_map = graph_manager.get_trial_medications(trial_ids)
        interaction_texts = get_interaction_texts(patient_meds)
        for trial in scored:
            t_meds = trial_meds_map.get(trial.get("trial_id", ""), [])
            trial["interaction_warnings"] = warnings_for_trial(
                interaction_texts, t_meds
            )
        all_warnings = list(
            {w for t in scored for w in t.get("interaction_warnings", [])}
        )
        if all_warnings:
            logger.info(
                "Interaction check: %d warning(s) across %d trial(s).",
                len(all_warnings),
                len(scored),
            )
        return scored, all_warnings
    except Exception as exc:
        logger.warning("Interaction enrichment failed: %s", exc)
        return scored, []


# ── Batch helper ──────────────────────────────────────────────────────────────


def _run_single_match(row: int, profile: str) -> dict:
    """Run the matching agent for one patient. Used by the batch endpoint."""
    try:
        final_state = agent_app.invoke({"patient_query": profile})
        scored: list[dict] = final_state.get("scored_trials", [])
        db: list[dict] = final_state.get("db_results", [])
        top = scored[0] if scored else (db[0] if db else None)
        return {
            "row": row,
            "profile": profile,
            "total_matches": len(scored) if scored else len(db),
            "top_trial_id": top.get("trial_id") if top else None,
            "top_trial_title": top.get("trial_title") if top else None,
            "top_score": top.get("score") if (top and scored) else None,
            "error": None,
        }
    except Exception as e:
        logger.error("Batch row %d failed: %s", row, e)
        return {
            "row": row,
            "profile": profile,
            "total_matches": 0,
            "top_trial_id": None,
            "top_trial_title": None,
            "top_score": None,
            "error": str(e),
        }


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/patients/match", response_model=MatchResponse, tags=["Agent"])
def match_patient(
    query: PatientQuery,
    response: Response,
    phase: str | None = QueryParam(None, description="Trial phase filter, e.g. PHASE3"),
    status: str | None = QueryParam(
        None, description="Trial status filter, e.g. RECRUITING"
    ),
):
    key = make_cache_key(f"{query.profile}|phase={phase or ''}|status={status or ''}")
    cached = cache_get(key)
    if cached:
        logger.info("Cache HIT for query: %.60s…", query.profile)
        response.headers["X-Cache"] = "HIT"
        response.headers["Cache-Control"] = "max-age=3600"
        return json.loads(cached)

    response.headers["X-Cache"] = "MISS"
    response.headers["Cache-Control"] = "no-store"

    try:
        initial_state: GraphState = {"patient_query": query.profile}
        if phase:
            initial_state["phase_filter"] = phase
        if status:
            initial_state["status_filter"] = status
        final_state = agent_app.invoke(initial_state)
        scored, all_warnings = _enrich_with_interactions(
            final_state.get("scored_trials", []),
            final_state.get("analyzed_profile", ""),
        )
        result = {
            "patient_profile": query.profile,
            "executed_cypher": final_state.get("cypher_query"),
            "agent_verdict": final_state.get("final_verdict"),
            "trials": final_state.get("db_results", []),
            "scored_trials": scored,
            "interaction_warnings": all_warnings,
        }
        cache_set(key, json.dumps(result))
        return result
    except Exception as e:
        logger.error("Agent execution failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Agent execution failed: {str(e)}")


@router.post("/patients/match/fhir", response_model=MatchResponse, tags=["Agent"])
def match_patient_fhir(bundle: FhirBundle, response: Response):
    if not bundle.entry:
        raise HTTPException(status_code=400, detail="FHIR Bundle has no entries.")
    try:
        patient_query = _parse_fhir_bundle(bundle)
        key = make_cache_key(patient_query)
        cached = cache_get(key)
        if cached:
            logger.info("Cache HIT (FHIR) for query: %.60s…", patient_query)
            response.headers["X-Cache"] = "HIT"
            response.headers["Cache-Control"] = "max-age=3600"
            return json.loads(cached)

        response.headers["X-Cache"] = "MISS"
        response.headers["Cache-Control"] = "no-store"

        initial_state: GraphState = {"patient_query": patient_query}
        final_state = agent_app.invoke(initial_state)
        scored, all_warnings = _enrich_with_interactions(
            final_state.get("scored_trials", []),
            final_state.get("analyzed_profile", ""),
        )
        result = {
            "patient_profile": patient_query,
            "executed_cypher": final_state.get("cypher_query"),
            "agent_verdict": final_state.get("final_verdict"),
            "trials": final_state.get("db_results", []),
            "scored_trials": scored,
            "interaction_warnings": all_warnings,
        }
        cache_set(key, json.dumps(result))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("FHIR agent execution failed: %s", e)
        raise HTTPException(status_code=500, detail=f"FHIR match failed: {str(e)}")


@router.post("/patients/match/stream", tags=["Agent"])
async def stream_match_patient(
    query: PatientQuery,
    phase: str | None = QueryParam(None, description="Trial phase filter, e.g. PHASE3"),
    status: str | None = QueryParam(
        None, description="Trial status filter, e.g. RECRUITING"
    ),
):
    # SSE is stateful — not cached
    async def event_stream():
        try:
            initial_state: GraphState = {"patient_query": query.profile}
            if phase:
                initial_state["phase_filter"] = phase
            if status:
                initial_state["status_filter"] = status
            accumulated: dict = {}
            async for chunk in agent_app.astream(initial_state):
                for node_name, node_output in chunk.items():
                    accumulated.update(node_output)
                    retry_count: int = accumulated.get("retry_count", 0)
                    label = (
                        f"Regenerating Cypher (retry {retry_count}/{MAX_RETRIES})"
                        if node_name == "generate_cypher" and retry_count > 0
                        else _NODE_LABELS.get(node_name, node_name)
                    )
                    status_val = (
                        "error"
                        if node_name == "execute_query"
                        and accumulated.get("error_message")
                        else "complete"
                    )
                    yield f"data: {json.dumps({'type': 'progress', 'node': node_name, 'label': label, 'status': status_val})}\n\n"

            # Run blocking interaction enrichment off the event loop
            scored, all_warnings = await asyncio.to_thread(
                _enrich_with_interactions,
                accumulated.get("scored_trials", []),
                accumulated.get("analyzed_profile", ""),
            )
            yield f"data: {json.dumps({'type': 'result', 'data': {'patient_profile': query.profile, 'executed_cypher': accumulated.get('cypher_query'), 'agent_verdict': accumulated.get('final_verdict'), 'trials': accumulated.get('db_results', []), 'scored_trials': scored, 'interaction_warnings': all_warnings}})}\n\n"
        except Exception as e:
            logger.error("SSE stream error: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/patients/match/batch",
    response_model=list[BatchMatchResult],
    tags=["Agent"],
)
def match_patients_batch(file: UploadFile = File(...)):
    # Batch results vary by CSV content — not cached
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    try:
        content = file.file.read().decode("utf-8-sig")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    reader = csv.DictReader(io.StringIO(content))
    fieldnames = reader.fieldnames or []
    profile_col = next((f for f in fieldnames if f.strip().lower() == "profile"), None)
    if profile_col is None:
        raise HTTPException(
            status_code=422,
            detail=f"CSV must have a 'profile' column. Found: {list(fieldnames)}",
        )

    rows: list[tuple[int, str]] = []
    for i, row in enumerate(reader, start=1):
        if i > BATCH_MAX_ROWS:
            break
        profile_text = row[profile_col].strip()
        if profile_text:
            rows.append((i, profile_text))

    if not rows:
        raise HTTPException(
            status_code=422, detail="No valid profile rows found in CSV."
        )

    logger.info("Batch match started: %d rows.", len(rows))
    results_map: dict[int, dict] = {}

    with ThreadPoolExecutor(max_workers=3) as executor:
        future_to_idx = {
            executor.submit(_run_single_match, row_num, profile): idx
            for idx, (row_num, profile) in enumerate(rows)
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                results_map[idx] = future.result(timeout=BATCH_LLM_TIMEOUT)
            except TimeoutError:
                row_num, profile = rows[idx]
                results_map[idx] = {
                    "row": row_num,
                    "profile": profile,
                    "total_matches": 0,
                    "top_trial_id": None,
                    "top_trial_title": None,
                    "top_score": None,
                    "error": f"Timed out after {BATCH_LLM_TIMEOUT}s",
                }

    ordered = [results_map[i] for i in range(len(rows))]
    logger.info("Batch match complete: %d results.", len(ordered))
    return ordered
