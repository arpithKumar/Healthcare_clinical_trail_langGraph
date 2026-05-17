import logging

from fastapi import APIRouter, HTTPException, Query

from src.dependencies import graph_manager
from src.models import SubgraphResponse

logger = logging.getLogger(__name__)

router = APIRouter()


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
