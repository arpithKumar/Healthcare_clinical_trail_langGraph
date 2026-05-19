import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.dependencies import graph_manager
from src.logging_config import setup_logging
from src.models import HealthResponse
from src.routers import graph as graph_router
from src.routers import patients as patients_router
from src.routers import trials as trials_router
from src.routers import watchlist as watchlist_router
from src.routers import search as search_router
from src.routers import medications as medications_router
from src.routers import patient_profiles as patient_profiles_router
from src.scheduler import (
    get_next_run_time,
    start_scheduler,
    stop_scheduler,
    trigger_seed_now,
)

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("API starting up.")
    start_scheduler()
    yield
    stop_scheduler()
    graph_manager.close()
    logger.info("API shut down. Neo4j driver closed.")


app = FastAPI(
    title="Clinical Trial GraphRAG API",
    description="REST interface for LLM-driven Neo4j trial matching.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check():
    return {"status": "healthy", "service": "GraphRAG API"}


@app.post("/api/v1/admin/seed", tags=["Admin"])
def trigger_seed():
    """Trigger an immediate seed run in the background."""
    trigger_seed_now()
    return {"status": "started", "message": "Seed job triggered in background."}


@app.get("/api/v1/admin/seed/status", tags=["Admin"])
def seed_status():
    """Return the next scheduled seed run time (ISO-8601), or null."""
    return {"next_run": get_next_run_time()}


_PREFIX = "/api/v1"
app.include_router(patients_router.router, prefix=_PREFIX)
app.include_router(graph_router.router, prefix=_PREFIX)
app.include_router(trials_router.router, prefix=_PREFIX)
app.include_router(watchlist_router.router, prefix=_PREFIX)
app.include_router(search_router.router, prefix=_PREFIX)
app.include_router(medications_router.router, prefix=_PREFIX)
app.include_router(patient_profiles_router.router, prefix=_PREFIX)
