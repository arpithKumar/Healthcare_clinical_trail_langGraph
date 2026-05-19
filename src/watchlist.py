import uuid
import logging
import datetime
from typing import Callable, Any

from neo4j import Driver

logger = logging.getLogger(__name__)


class WatchlistManager:
    """Manages saved patient profiles stored as :SavedProfile nodes in Neo4j."""

    def __init__(self, driver: Driver) -> None:
        self.driver = driver
        self._ensure_index()

    def _ensure_index(self) -> None:
        with self.driver.session() as session:
            session.run(
                "CREATE INDEX saved_profile_id IF NOT EXISTS FOR (p:SavedProfile) ON (p.id)"
            )

    # ── CRUD ──────────────────────────────────────────────────────────────────

    def save_profile(self, profile_text: str) -> dict:
        """Persist a new patient profile and return its record."""
        pid = str(uuid.uuid4())
        created_at = datetime.datetime.now(datetime.UTC).isoformat()
        with self.driver.session() as session:
            session.run(
                """
                CREATE (p:SavedProfile {
                    id:              $id,
                    profile_text:    $profile_text,
                    created_at:      $created_at,
                    last_trial_ids:  []
                })
                """,
                id=pid,
                profile_text=profile_text,
                created_at=created_at,
            )
        logger.info("Saved watchlist profile %s.", pid)
        return {
            "id": pid,
            "profile_text": profile_text,
            "created_at": created_at,
            "last_trial_ids": [],
        }

    def list_profiles(self) -> list[dict]:
        """Return all saved profiles ordered by creation time (newest first)."""
        with self.driver.session() as session:
            result = session.run("""
                MATCH (p:SavedProfile)
                RETURN p.id               AS id,
                       p.profile_text     AS profile_text,
                       p.created_at       AS created_at,
                       p.last_trial_ids   AS last_trial_ids,
                       p.notes            AS notes,
                       p.notes_updated_at AS notes_updated_at
                ORDER BY p.created_at DESC
                """)
            return [dict(r) for r in result]

    def delete_profile(self, profile_id: str) -> bool:
        """Delete a profile by ID. Returns True if the node existed and was deleted."""
        with self.driver.session() as session:
            # Check existence first (DELETE alone gives no "found" signal in Neo4j 5)
            check = session.run(
                "MATCH (p:SavedProfile {id: $id}) RETURN count(p) AS c",
                id=profile_id,
            )
            record = check.single(strict=True)
            if record["c"] == 0:
                return False
            session.run(
                "MATCH (p:SavedProfile {id: $id}) DELETE p",
                id=profile_id,
            )
        logger.info("Deleted watchlist profile %s.", profile_id)
        return True

    def update_notes(self, profile_id: str, notes: str) -> bool:
        """Update the notes field for a profile. Returns False if not found."""
        import datetime as _dt
        with self.driver.session() as session:
            check = session.run(
                "MATCH (p:SavedProfile {id: $id}) RETURN count(p) AS c",
                id=profile_id,
            )
            record = check.single(strict=True)
            if record["c"] == 0:
                return False
            session.run(
                """
                MATCH (p:SavedProfile {id: $id})
                SET p.notes            = $notes,
                    p.notes_updated_at = $updated_at
                """,
                id=profile_id,
                notes=notes,
                updated_at=_dt.datetime.now(datetime.UTC).isoformat(),
            )
        logger.info("Updated notes for profile %s.", profile_id)
        return True

    # ── Monitoring run ────────────────────────────────────────────────────────

    def run_all(self, agent_invoke: Callable[..., Any]) -> list[dict]:
        """
        Re-runs the matching agent for every saved profile.

        `agent_invoke` should be `agent_app.invoke` — a callable that accepts a
        GraphState dict and returns the final state dict.

        Returns one result dict per profile, each with:
          - profile_id, profile_text, created_at
          - total_matches: int
          - new_matches: list[str]   — trial IDs not seen in the previous run
          - scored_trials: list[dict]
          - error: str | None
        """
        profiles = self.list_profiles()
        if not profiles:
            logger.info("Watchlist is empty — nothing to run.")
            return []

        results: list[dict] = []

        for profile in profiles:
            pid = profile["id"]
            profile_text = profile["profile_text"]
            previous_ids: list[str] = profile.get("last_trial_ids") or []

            try:
                final_state = agent_invoke({"patient_query": profile_text})
                db_results = final_state.get("db_results", [])
                current_ids = [
                    r.get("trial_id", "") for r in db_results if r.get("trial_id")
                ]
                new_ids = [tid for tid in current_ids if tid not in previous_ids]

                self._update_last_trial_ids(pid, current_ids)

                results.append(
                    {
                        "profile_id": pid,
                        "profile_text": profile_text,
                        "created_at": profile.get("created_at", ""),
                        "total_matches": len(current_ids),
                        "new_matches": new_ids,
                        "scored_trials": final_state.get("scored_trials", []),
                        "error": None,
                    }
                )
                logger.info(
                    "Watchlist run: profile=%s  total=%d  new=%d",
                    pid,
                    len(current_ids),
                    len(new_ids),
                )

            except Exception as e:
                logger.error("Watchlist run failed for profile %s: %s", pid, e)
                results.append(
                    {
                        "profile_id": pid,
                        "profile_text": profile_text,
                        "created_at": profile.get("created_at", ""),
                        "total_matches": 0,
                        "new_matches": [],
                        "scored_trials": [],
                        "error": str(e),
                    }
                )

        return results

    def _update_last_trial_ids(self, profile_id: str, trial_ids: list[str]) -> None:
        with self.driver.session() as session:
            session.run(
                "MATCH (p:SavedProfile {id: $id}) SET p.last_trial_ids = $ids",
                id=profile_id,
                ids=trial_ids,
            )
