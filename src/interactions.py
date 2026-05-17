import logging

import requests

logger = logging.getLogger(__name__)

_OPENFDA_URL = "https://api.fda.gov/drug/label.json"
_TIMEOUT = 5


def _get_interaction_text(med_name: str) -> str:
    """Fetch the drug_interactions field from OpenFDA for one medication.

    Returns the text lowercased, or "" on any failure (404, timeout, missing field).
    Never raises.
    """
    try:
        resp = requests.get(
            _OPENFDA_URL,
            params={
                "search": (
                    f'openfda.generic_name:"{med_name}"'
                    f' OR openfda.brand_name:"{med_name}"'
                ),
                "limit": 1,
            },
            timeout=_TIMEOUT,
        )
        if resp.status_code == 404:
            return ""
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if not results:
            return ""
        raw = results[0].get("drug_interactions", [])
        if isinstance(raw, list):
            return " ".join(raw).lower()
        return str(raw).lower()
    except Exception as exc:
        logger.warning("OpenFDA lookup failed for '%s': %s", med_name, exc)
        return ""


def get_interaction_texts(patient_meds: list[str]) -> dict[str, str]:
    """Fetch interaction texts for all patient medications (one OpenFDA call per med).

    Returns {med_name: lowercased_interaction_text}.
    """
    return {med: _get_interaction_text(med) for med in patient_meds}


def warnings_for_trial(
    interaction_texts: dict[str, str], trial_meds: list[str]
) -> list[str]:
    """Given pre-fetched interaction texts and a specific trial's medication list,
    return human-readable warning strings for every conflicting pair.
    """
    warnings: list[str] = []
    for p_med, itext in interaction_texts.items():
        if not itext:
            continue
        for t_med in trial_meds:
            if t_med.lower() in itext:
                warnings.append(
                    f"{p_med.title()} (patient) may interact with "
                    f"{t_med.title()} (trial medication)"
                )
    return warnings


def check_interactions(patient_meds: list[str], trial_meds: list[str]) -> list[str]:
    """Convenience wrapper: fetch interaction texts then check against trial meds.

    Returns a list of human-readable warning strings.
    Never raises — all failures are logged as warnings.
    """
    if not patient_meds or not trial_meds:
        return []
    texts = get_interaction_texts(patient_meds)
    return warnings_for_trial(texts, trial_meds)
