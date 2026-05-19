import logging

from fastapi import APIRouter, Query
from src.dependencies import graph_manager
from src.models import TrialSearchResponse, TrialSearchResult

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Search"])

_COUNT_CYPHER = """
MATCH (t:Trial)
WHERE ($q = '' OR toLower(t.title) CONTAINS toLower($q))
  AND ($phase = '' OR t.phase = $phase)
  AND ($status = '' OR t.status = $status)
OPTIONAL MATCH (t)-[:TREATS]->(c:Condition)
WITH t, collect(DISTINCT c.name) AS conditions
WHERE ($condition = '' OR ANY(cond IN conditions WHERE toLower(cond) CONTAINS toLower($condition)))
RETURN count(t) AS total
"""

_SEARCH_CYPHER = """
MATCH (t:Trial)
WHERE ($q = '' OR toLower(t.title) CONTAINS toLower($q))
  AND ($phase = '' OR t.phase = $phase)
  AND ($status = '' OR t.status = $status)
OPTIONAL MATCH (t)-[:TREATS]->(c:Condition)
WITH t, collect(DISTINCT c.name) AS conditions
WHERE ($condition = '' OR ANY(cond IN conditions WHERE toLower(cond) CONTAINS toLower($condition)))
RETURN t.id          AS trial_id,
       t.title       AS title,
       t.phase       AS phase,
       t.status      AS status,
       conditions,
       size(conditions) AS condition_count
ORDER BY t.title
SKIP  $skip
LIMIT $limit
"""


@router.get("/trials/search", response_model=TrialSearchResponse)
def search_trials(
    q: str = Query(default="", description="Free-text search on trial title"),
    condition: str = Query(default="", description="Filter by condition name (partial match)"),
    phase: str = Query(default="", description="Exact phase filter e.g. PHASE3"),
    status: str = Query(default="", description="Exact status filter e.g. RECRUITING"),
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(default=20, ge=1, le=100, description="Results per page"),
) -> TrialSearchResponse:
    """Search and browse all trials in the knowledge graph — no LLM needed."""
    params = {
        "q": q.strip(),
        "condition": condition.strip(),
        "phase": phase.strip(),
        "status": status.strip(),
        "skip": (page - 1) * limit,
        "limit": limit,
    }

    with graph_manager.driver.session() as session:
        total_record = session.run(_COUNT_CYPHER, **params).single(strict=True)
        total: int = total_record["total"]

        rows = session.run(_SEARCH_CYPHER, **params).data()

    trials = [
        TrialSearchResult(
            trial_id=row["trial_id"],
            title=row["title"] or "",
            phase=row["phase"],
            status=row["status"],
            conditions=row["conditions"] or [],
            condition_count=row["condition_count"] or 0,
        )
        for row in rows
    ]

    pages = max(1, -(-total // limit))  # ceiling division
    return TrialSearchResponse(trials=trials, total=total, page=page, limit=limit, pages=pages)
