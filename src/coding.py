import logging

import requests

logger = logging.getLogger(__name__)

_NLM_API = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search"
_TIMEOUT = 5  # seconds — fast enough to not block ingestion significantly


def map_to_icd10(condition_name: str) -> str | None:
    """
    Map a free-text condition name to its best ICD-10-CM code using the
    NIH NLM Clinical Tables API (free, no API key required).

    Returns the code string (e.g. "E11.9") or None on no match / failure.

    Response format: [total, [codes], {hints}, [[code, display], ...]]
    """
    try:
        resp = requests.get(
            _NLM_API,
            params={"sf": "code,name", "terms": condition_name, "maxList": 1},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        codes: list = data[1] if isinstance(data, list) and len(data) >= 2 else []
        if codes:
            code = str(codes[0])
            logger.debug("ICD-10 mapped '%s' → %s", condition_name, code)
            return code
        logger.debug("ICD-10: no match for '%s'", condition_name)
        return None
    except Exception as exc:
        logger.warning("ICD-10 lookup failed for '%s': %s", condition_name, exc)
        return None
