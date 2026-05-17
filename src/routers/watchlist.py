import logging

from fastapi import APIRouter, HTTPException

from src.agent import app as agent_app
from src.dependencies import watchlist_manager
from src.models import (
    SaveProfileRequest,
    WatchlistProfileResponse,
    WatchlistRunItemResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/watchlist", response_model=WatchlistProfileResponse, tags=["Watchlist"])
def save_watchlist_profile(request: SaveProfileRequest):
    if not request.profile_text.strip():
        raise HTTPException(status_code=400, detail="profile_text must not be empty.")
    try:
        return watchlist_manager.save_profile(request.profile_text.strip())
    except Exception as e:
        logger.error("Failed to save watchlist profile: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/watchlist", response_model=list[WatchlistProfileResponse], tags=["Watchlist"]
)
def list_watchlist_profiles():
    try:
        return watchlist_manager.list_profiles()
    except Exception as e:
        logger.error("Failed to list watchlist profiles: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/watchlist/{profile_id}", tags=["Watchlist"])
def delete_watchlist_profile(profile_id: str):
    try:
        found = watchlist_manager.delete_profile(profile_id)
        if not found:
            raise HTTPException(
                status_code=404, detail=f"Profile {profile_id} not found."
            )
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete watchlist profile: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/watchlist/run",
    response_model=list[WatchlistRunItemResponse],
    tags=["Watchlist"],
)
def run_watchlist():
    try:
        return watchlist_manager.run_all(agent_app.invoke)
    except Exception as e:
        logger.error("Watchlist run failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
