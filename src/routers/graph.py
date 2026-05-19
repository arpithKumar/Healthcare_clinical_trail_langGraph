import logging

from fastapi import APIRouter, HTTPException, Query

from src.dependencies import graph_manager
from src.models import ConditionStat, GraphQualityResponse, GraphStats, SubgraphResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/graph/conditions", response_model=list[ConditionStat], tags=["Graph"])
def get_conditions(
        status: str | None = Query(default=None),
        limit: int = Query(default=50, ge=1, le=200),
):
    """Return conditions sorted by trial count, optionally filtered by trial status."""
    try:
        return graph_manager.get_conditions(status=status, limit=limit)
    except Exception as e:
        logger.error("Conditions fetch failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph/stats", response_model=GraphStats, tags=["Graph"])
def get_graph_stats():
    """Return aggregate statistics about the knowledge graph."""
    try:
        return graph_manager.get_graph_stats()
    except Exception as e:
        logger.error("Graph stats failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph/subgraph", response_model=SubgraphResponse, tags=["Graph"])
def get_subgraph(trial_ids: str = Query(...)):
    ids = [t.strip() for t in trial_ids.split(",") if t.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="trial_ids is required.")
    try:
        return graph_manager.get_subgraph(ids)
    except Exception as e:
        logger.error("Subgraph fetch failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph/quality", response_model=GraphQualityResponse, tags=["Admin"])
def get_graph_quality():
    """Return a health report for the knowledge graph."""
    try:
        return graph_manager.get_graph_quality()
    except Exception as e:
        logger.error("Graph quality check failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/graph/quality/fix-icd10", tags=["Admin"])
def fix_missing_icd10():
    """Bulk-enrich conditions that have no ICD-10 code via the NIH NLM API."""
    try:
        fixed = graph_manager.fix_missing_icd10()
        return {"fixed": fixed}
    except Exception as e:
        logger.error("ICD-10 fix failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
