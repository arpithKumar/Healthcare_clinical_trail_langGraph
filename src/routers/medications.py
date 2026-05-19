import logging

import requests
from fastapi import APIRouter, Query

from src.dependencies import graph_manager
from src.interactions import get_interaction_texts
from src.models import MedicationDetailResponse, MedicationTrialSummary

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/medications", tags=["medications"])


@router.get("/search")
async def search_medications(
        q: str = Query(min_length=1),
        limit: int = Query(default=20, ge=1, le=100),
) -> list[str]:
    return graph_manager.search_medications(q, limit=limit)


@router.get("/{name}")
async def get_medication(name: str) -> MedicationDetailResponse:
    data = graph_manager.get_medication_detail(name)
    interaction_text: str | None = None
    try:
        texts = get_interaction_texts([name])
        raw = texts.get(name, "")
        interaction_text = raw if raw else None
    except requests.exceptions.RequestException as exc:
        logger.warning("OpenFDA lookup failed for medication %s: %s", name, exc)
    return MedicationDetailResponse(
        name=name,
        trials=[MedicationTrialSummary(**t) for t in data["trials"]],
        conditions=data["conditions"],
        interaction_text=interaction_text,
    )
