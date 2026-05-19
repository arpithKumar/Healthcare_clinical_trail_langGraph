import os
import logging
import threading
import uuid
from dotenv import load_dotenv
from neo4j import GraphDatabase
from src.schema import ExtractedEntities

# Load environmental variables from the .env file in the project root
load_dotenv()

logger = logging.getLogger(__name__)

try:
    NEO4J_URI = os.environ["NEO4J_URI"]
    NEO4J_USER = os.environ["NEO4J_USER"]
    NEO4J_PASSWORD = os.environ["NEO4J_PASSWORD"]
except KeyError as e:
    raise ValueError(f"Missing required environment variable: {e}")


class GraphManager:
    _driver = None
    _lock = threading.Lock()

    def __init__(self):
        with GraphManager._lock:
            if GraphManager._driver is None:
                GraphManager._driver = GraphDatabase.driver(
                    NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)
                )
        self.driver = GraphManager._driver
        self._ensure_indexes()

    @classmethod
    def close(cls) -> None:
        if cls._driver is not None:
            cls._driver.close()
            cls._driver = None

    def trial_exists(self, trial_id: str) -> bool:
        """Returns True if a Trial node with this ID already exists in the graph."""
        with self.driver.session() as session:
            result = session.run(
                "MATCH (t:Trial {id: $trial_id}) RETURN COUNT(t) AS count",
                trial_id=trial_id,
            )
            record = result.single(strict=True)
            return record["count"] > 0

    def _ensure_indexes(self):
        """Creates indexes on first startup. Safe to call repeatedly (IF NOT EXISTS)."""
        with self.driver.session() as session:
            session.run("CREATE INDEX trial_id IF NOT EXISTS FOR (t:Trial) ON (t.id)")
            session.run(
                "CREATE INDEX condition_name IF NOT EXISTS FOR (c:Condition) ON (c.name)"
            )
            session.run(
                "CREATE INDEX medication_name IF NOT EXISTS FOR (m:Medication) ON (m.name)"
            )
            session.run(
                "CREATE INDEX condition_icd10 IF NOT EXISTS FOR (c:Condition) ON (c.icd10_code)"
            )
            session.run(
                "CREATE INDEX trial_phase IF NOT EXISTS FOR (t:Trial) ON (t.phase)"
            )
            session.run(
                "CREATE INDEX trial_status IF NOT EXISTS FOR (t:Trial) ON (t.status)"
            )
            session.run(
                "CREATE INDEX match_history_id IF NOT EXISTS FOR (h:MatchHistory) ON (h.id)"
            )
            session.run(
                "CREATE INDEX match_history_created_at IF NOT EXISTS FOR (h:MatchHistory) ON (h.created_at)"
            )
            session.run(
                "CREATE INDEX patient_profile_id IF NOT EXISTS FOR (p:PatientProfile) ON (p.id)"
            )
            session.run(
                "CREATE INDEX pending_review_id IF NOT EXISTS FOR (r:PendingReview) ON (r.id)"
            )

    def search_medications(self, query: str, limit: int = 20) -> list[str]:
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (m:Medication)
                WHERE toLower(m.name) CONTAINS toLower($query)
                RETURN m.name AS name
                ORDER BY m.name
                LIMIT $limit
                """,
                query=query,
                limit=limit,
            )
            return [r["name"] for r in result]

    def get_medication_detail(self, name: str) -> dict:
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (t:Trial)-[:USES_MEDICATION]->(m:Medication)
                WHERE toLower(m.name) = toLower($name)
                OPTIONAL MATCH (t)-[:TREATS]->(c:Condition)
                WITH t, collect(DISTINCT c.name) AS conds
                RETURN t.id      AS trial_id,
                       t.title   AS title,
                       t.phase   AS phase,
                       t.status  AS status,
                       conds     AS conditions
                ORDER BY t.id
                """,
                name=name,
            )
            trials: list[dict] = []
            all_conditions: set[str] = set()
            for r in result:
                trials.append({
                    "trial_id": r["trial_id"],
                    "title": r["title"],
                    "phase": r["phase"],
                    "status": r["status"],
                })
                for c in r["conditions"]:
                    if c:
                        all_conditions.add(c)
            return {"trials": trials, "conditions": sorted(all_conditions)}

    def ingest_trial(
            self,
            trial_id: str,
            extracted_data: ExtractedEntities,
            overwrite: bool = False,
            phase: str | None = None,
            status: str | None = None,
    ):
        """Executes batched Cypher queries to build the graph.

        Skips ingestion if the trial already exists, unless overwrite=True.
        """
        if not overwrite and self.trial_exists(trial_id):
            logger.warning(
                "Trial %s already exists — skipping. Pass overwrite=True to update.",
                trial_id,
            )
            return

        with self.driver.session() as session:
            session.execute_write(
                self._create_graph_topology, trial_id, extracted_data, phase, status
            )
        logger.info("Ingested trial %s into Neo4j.", trial_id)

    def get_subgraph(self, trial_ids: list[str]) -> dict:
        """Return nodes and relationships for the given trial IDs as a graph payload."""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (t:Trial) WHERE t.id IN $trial_ids
                OPTIONAL MATCH (t)-[r]->(n)
                RETURN
                    t.id          AS trial_id,
                    t.title       AS trial_title,
                    type(r)       AS rel_type,
                    n.name        AS node_name,
                    labels(n)[0]  AS node_type
                """,
                trial_ids=trial_ids,
            )

            nodes: dict[str, dict] = {}
            links: list[dict] = []

            for record in result:
                trial_id = record["trial_id"]
                trial_title = record["trial_title"]

                if trial_id not in nodes:
                    nodes[trial_id] = {
                        "id": trial_id,
                        "label": trial_title or trial_id,
                        "type": "Trial",
                    }

                node_name = record["node_name"]
                node_type = record["node_type"]
                rel_type = record["rel_type"]

                if node_name and node_type and rel_type:
                    node_id = f"{node_type}:{node_name}"
                    if node_id not in nodes:
                        nodes[node_id] = {
                            "id": node_id,
                            "label": node_name,
                            "type": node_type,
                        }
                    links.append(
                        {
                            "source": trial_id,
                            "target": node_id,
                            "type": rel_type,
                        }
                    )

        logger.info(
            "Subgraph: %d nodes, %d links for %d trial(s).",
            len(nodes),
            len(links),
            len(trial_ids),
        )
        return {"nodes": list(nodes.values()), "links": links}

    def get_trial_context(self, trial_id: str) -> dict | None:
        """Fetch a trial's structured data for ideal-patient profile generation."""
        with self.driver.session() as session:
            trial_result = session.run(
                """
                MATCH (t:Trial {id: $trial_id})
                RETURN t.id AS id, t.title AS title,
                    t.min_age AS min_age, t.max_age AS max_age
                """,
                trial_id=trial_id,
            )
            trial_record = trial_result.single()
            if trial_record is None:
                return None

            rel_result = session.run(
                """
                MATCH (t:Trial {id: $trial_id})-[r]->(n)
                RETURN type(r) AS rel_type, n.name AS name
                """,
                trial_id=trial_id,
            )

            conditions_treated: list[str] = []
            medications_used: list[str] = []
            conditions_excluded: list[str] = []
            medications_excluded: list[str] = []

            for rec in rel_result:
                rel_type = rec["rel_type"]
                name = rec["name"]
                if rel_type == "TREATS":
                    conditions_treated.append(name)
                elif rel_type == "USES_MEDICATION":
                    medications_used.append(name)
                elif rel_type == "EXCLUDES_CONDITION":
                    conditions_excluded.append(name)
                elif rel_type == "EXCLUDES_MEDICATION":
                    medications_excluded.append(name)

        logger.info(
            "Trial context fetched for %s: %d conditions, %d meds.",
            trial_id,
            len(conditions_treated),
            len(medications_used),
        )
        return {
            "trial_id": trial_record["id"],
            "trial_title": trial_record["title"],
            "min_age": trial_record["min_age"],
            "max_age": trial_record["max_age"],
            "conditions_treated": conditions_treated,
            "medications_used": medications_used,
            "conditions_excluded": conditions_excluded,
            "medications_excluded": medications_excluded,
        }

    def get_trial_detail(self, trial_id: str) -> dict | None:
        """Fetch full trial profile including all relationships with ICD-10 codes."""
        with self.driver.session() as session:
            trial_result = session.run(
                """
                MATCH (t:Trial {id: $trial_id})
                RETURN t.id     AS id,
                       t.title  AS title,
                       t.phase  AS phase,
                       t.status AS status,
                       t.min_age AS min_age,
                       t.max_age AS max_age
                """,
                trial_id=trial_id,
            )
            trial_record = trial_result.single()
            if trial_record is None:
                return None

            rel_result = session.run(
                """
                MATCH (t:Trial {id: $trial_id})-[r]->(n)
                RETURN type(r) AS rel_type,
                       n.name  AS name,
                       CASE WHEN n:Condition THEN n.icd10_code ELSE null END AS icd10_code
                """,
                trial_id=trial_id,
            )

            conditions_treated: list[dict] = []
            medications_used: list[str] = []
            conditions_excluded: list[dict] = []
            medications_excluded: list[str] = []

            for rec in rel_result:
                rel_type = rec["rel_type"]
                name = rec["name"]
                icd10 = rec["icd10_code"]
                if rel_type == "TREATS":
                    conditions_treated.append({"name": name, "icd10_code": icd10})
                elif rel_type == "USES_MEDICATION":
                    medications_used.append(name)
                elif rel_type == "EXCLUDES_CONDITION":
                    conditions_excluded.append({"name": name, "icd10_code": icd10})
                elif rel_type == "EXCLUDES_MEDICATION":
                    medications_excluded.append(name)

        return {
            "trial_id": trial_record["id"],
            "title": trial_record["title"] or "",
            "phase": trial_record["phase"],
            "status": trial_record["status"],
            "min_age": trial_record["min_age"],
            "max_age": trial_record["max_age"],
            "conditions_treated": conditions_treated,
            "medications_used": medications_used,
            "conditions_excluded": conditions_excluded,
            "medications_excluded": medications_excluded,
        }

    def get_similar_trials(
            self,
            trial_id: str,
            exclude_ids: list[str],
            limit: int = 6,
    ) -> list[dict]:
        """Find trials sharing ≥2 conditions or medications with the given trial."""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (t:Trial {id: $trial_id})-[:TREATS|USES_MEDICATION]->(shared)
                    <-[:TREATS|USES_MEDICATION]-(other:Trial)
                WHERE other.id <> $trial_id AND NOT other.id IN $exclude_ids
                WITH other,
                     [x IN collect(DISTINCT shared) WHERE x:Condition | x.name]
                         AS shared_conditions,
                     [x IN collect(DISTINCT shared) WHERE x:Medication | x.name]
                         AS shared_medications,
                     count(DISTINCT shared) AS overlap_count
                WHERE overlap_count >= 2
                RETURN other.id          AS trial_id,
                       COALESCE(other.title, other.id) AS title,
                       shared_conditions,
                       shared_medications,
                       overlap_count
                ORDER BY overlap_count DESC
                LIMIT $limit
                """,
                trial_id=trial_id,
                exclude_ids=exclude_ids,
                limit=limit,
            )
            return [
                {
                    "trial_id": r["trial_id"],
                    "title": r["title"],
                    "shared_conditions": list(r["shared_conditions"]),
                    "shared_medications": list(r["shared_medications"]),
                    "overlap_count": r["overlap_count"],
                }
                for r in result
            ]

    def save_match_history(
            self,
            profile: str,
            top_trial_id: str | None,
            top_trial_title: str | None,
            top_score: int | None,
            total_matches: int,
    ) -> None:
        """Persist a match run to the history log."""
        import uuid as _uuid
        from datetime import datetime, timezone

        with self.driver.session() as session:
            session.run(
                """
                CREATE (:MatchHistory {
                    id:              $id,
                    profile:         $profile,
                    top_trial_id:    $top_trial_id,
                    top_trial_title: $top_trial_title,
                    top_score:       $top_score,
                    total_matches:   $total_matches,
                    created_at:      $created_at
                })
                """,
                id=str(_uuid.uuid4()),
                profile=profile,
                top_trial_id=top_trial_id,
                top_trial_title=top_trial_title,
                top_score=top_score,
                total_matches=total_matches,
                created_at=datetime.now(timezone.utc).isoformat(),
            )
        logger.debug("Match history saved for profile: %.60s…", profile)

    def list_match_history(self, limit: int = 20) -> list[dict]:
        """Return recent match history records, newest first."""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (h:MatchHistory)
                RETURN h.id              AS id,
                       h.profile         AS profile,
                       h.top_trial_id    AS top_trial_id,
                       h.top_trial_title AS top_trial_title,
                       h.top_score       AS top_score,
                       h.total_matches   AS total_matches,
                       h.created_at      AS created_at
                ORDER BY h.created_at DESC
                LIMIT $limit
                """,
                limit=limit,
            )
            return [
                {
                    "id": r["id"],
                    "profile": r["profile"],
                    "top_trial_id": r["top_trial_id"],
                    "top_trial_title": r["top_trial_title"],
                    "top_score": r["top_score"],
                    "total_matches": r["total_matches"],
                    "created_at": r["created_at"],
                }
                for r in result
            ]

    def get_trial_medications(self, trial_ids: list[str]) -> dict[str, list[str]]:
        """Return {trial_id: [medication_names]} for the given trial IDs."""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (t:Trial)-[:USES_MEDICATION]->(m:Medication)
                WHERE t.id IN $trial_ids
                RETURN t.id AS trial_id, collect(m.name) AS medications
                """,
                trial_ids=trial_ids,
            )
            return {
                record["trial_id"]: list(record["medications"]) for record in result
            }

    def get_conditions(
            self, status: str | None = None, limit: int = 50
    ) -> list[dict]:
        """Return conditions sorted by trial count, optionally filtered by trial status."""
        with self.driver.session() as session:
            if status:
                result = session.run(
                    """
                    MATCH (c:Condition)<-[:TREATS]-(t:Trial {status: $status})
                    WITH c.name AS name, c.icd10_code AS icd10_code, count(t) AS trial_count
                    ORDER BY trial_count DESC
                    LIMIT $limit
                    RETURN name, icd10_code, trial_count
                    """,
                    status=status,
                    limit=limit,
                )
            else:
                result = session.run(
                    """
                    MATCH (c:Condition)<-[:TREATS]-(t:Trial)
                    WITH c.name AS name, c.icd10_code AS icd10_code, count(t) AS trial_count
                    ORDER BY trial_count DESC
                    LIMIT $limit
                    RETURN name, icd10_code, trial_count
                    """,
                    limit=limit,
                )
            return [
                {
                    "name": r["name"],
                    "icd10_code": r["icd10_code"],
                    "trial_count": r["trial_count"],
                }
                for r in result
            ]

    def get_graph_stats(self) -> dict:
        """Return aggregate statistics about the knowledge graph."""
        with self.driver.session() as session:
            trial_count: int = session.run(
                "MATCH (t:Trial) RETURN count(t) AS n"
            ).single(strict=True)["n"]

            condition_count: int = session.run(
                "MATCH (c:Condition) RETURN count(c) AS n"
            ).single(strict=True)["n"]

            medication_count: int = session.run(
                "MATCH (m:Medication) RETURN count(m) AS n"
            ).single(strict=True)["n"]

            top_conditions = session.run(
                """
                MATCH (c:Condition)<-[:TREATS]-(t:Trial)
                WITH c.name AS name, c.icd10_code AS icd10_code, count(t) AS trial_count
                ORDER BY trial_count DESC
                LIMIT 10
                RETURN name, icd10_code, trial_count
                """
            ).data()

            phase_dist = session.run(
                """
                MATCH (t:Trial) WHERE t.phase IS NOT NULL
                RETURN t.phase AS label, count(t) AS count
                ORDER BY count DESC
                """
            ).data()

            status_dist = session.run(
                """
                MATCH (t:Trial) WHERE t.status IS NOT NULL
                RETURN t.status AS label, count(t) AS count
                ORDER BY count DESC
                """
            ).data()

        logger.info(
            "Graph stats: %d trials, %d conditions, %d medications.",
            trial_count,
            condition_count,
            medication_count,
        )
        return {
            "trial_count": trial_count,
            "condition_count": condition_count,
            "medication_count": medication_count,
            "top_conditions": [
                {"name": r["name"], "icd10_code": r["icd10_code"], "trial_count": r["trial_count"]}
                for r in top_conditions
            ],
            "phase_distribution": [
                {"label": r["label"], "count": r["count"]} for r in phase_dist
            ],
            "status_distribution": [
                {"label": r["label"], "count": r["count"]} for r in status_dist
            ],
        }

    def get_trial_criteria(self, trial_id: str) -> dict:
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (t:Trial {id: $trial_id})
                OPTIONAL MATCH (t)-[:TREATS]->(inc:Condition)
                OPTIONAL MATCH (t)-[:EXCLUDES_CONDITION]->(exc_c:Condition)
                OPTIONAL MATCH (t)-[:EXCLUDES_MEDICATION]->(exc_m:Medication)
                RETURN t.min_age                       AS min_age,
                       t.max_age                       AS max_age,
                       collect(DISTINCT inc.name)      AS included_conditions,
                       collect(DISTINCT exc_c.name)    AS excluded_conditions,
                       collect(DISTINCT exc_m.name)    AS excluded_medications
                """,
                trial_id=trial_id,
            )
            row = result.single()
            if not row:
                return {}
            return {
                "min_age": row["min_age"],
                "max_age": row["max_age"],
                "included_conditions": [c for c in row["included_conditions"] if c],
                "excluded_conditions": [c for c in row["excluded_conditions"] if c],
                "excluded_medications": [m for m in row["excluded_medications"] if m],
            }

    # ── Graph quality ──────────────────────────────────────────────

    def get_graph_quality(self) -> dict:
        with self.driver.session() as session:
            total = session.run(
                """MATCH (t:Trial) RETURN count(t) AS n"""
            ).single(strict=True)["n"]

            missing_phase = session.run(
                """MATCH (t:Trial) WHERE t.phase IS NULL OR t.phase = ''
                RETURN count(t) AS n, collect(t.id)[..20] AS ids"""
            ).single(strict=True)

            missing_status = session.run(
                """MATCH (t:Trial) WHERE t.status IS NULL OR t.status = ''
                RETURN count(t) AS n, collect(t.id)[..20] AS ids"""
            ).single(strict=True)

            zero_conditions = session.run(
                """MATCH (t:Trial) WHERE NOT (t)-[:TREATS]->(:Condition)
                RETURN count(t) AS n, collect(t.id)[..20] AS ids"""
            ).single(strict=True)

            missing_icd10 = session.run(
                """MATCH (c:Condition) WHERE c.icd10_code IS NULL
                RETURN count(c) AS n, collect(c.name)[..20] AS names"""
            ).single(strict=True)

            cond_total = session.run(
                """MATCH (c:Condition) RETURN count(c) AS n"""
            ).single(strict=True)["n"]

            pending_reviews = session.run(
                """MATCH (r:PendingReview) RETURN count(r) AS n"""
            ).single(strict=True)["n"]

        # Health score: deduct proportionally per issue type
        health_score = 100
        if total > 0:
            health_score -= int((missing_phase["n"] / total) * 20)
            health_score -= int((missing_status["n"] / total) * 20)
            health_score -= int((zero_conditions["n"] / total) * 30)
        if cond_total > 0:
            health_score -= int((missing_icd10["n"] / cond_total) * 30)
        health_score = max(0, health_score)

        return {
            "health_score": health_score,
            "total_trials": total,
            "pending_reviews": pending_reviews,
            "issues": [
                {
                    "type": "missing_phase",
                    "label": "Trials missing phase",
                    "count": missing_phase["n"],
                    "items": list(missing_phase["ids"]),
                },
                {
                    "type": "missing_status",
                    "label": "Trials missing status",
                    "count": missing_status["n"],
                    "items": list(missing_status["ids"]),
                },
                {
                    "type": "zero_conditions",
                    "label": "Trials with no conditions",
                    "count": zero_conditions["n"],
                    "items": list(zero_conditions["ids"]),
                },
                {
                    "type": "missing_icd10",
                    "label": "Conditions missing ICD-10 code",
                    "count": missing_icd10["n"],
                    "items": list(missing_icd10["names"]),
                },
            ],
        }

    def fix_missing_icd10(self) -> int:
        """Look up and populate ICD-10 codes for all conditions currently missing them."""
        from src.coding import map_to_icd10

        with self.driver.session() as session:
            result = session.run(
                "MATCH (c:Condition) WHERE c.icd10_code IS NULL RETURN c.name AS name"
            )
            names = [row["name"] for row in result]

        updates: list[dict] = []
        for name in names:
            code = map_to_icd10(name)
            if code:
                updates.append({"name": name, "code": code})

        if updates:
            with self.driver.session() as session:
                session.run(
                    """UNWIND $updates AS u
                    MATCH (c:Condition {name: u.name})
                    SET c.icd10_code = u.code""",
                    updates=updates,
                )

        logger.info("ICD-10 fix: enriched %d / %d conditions", len(updates), len(names))
        return len(updates)

    # ── Pending review queue ──────────────────────────────────────

    def ingest_pending_review(
            self,
            trial_id: str,
            text: str,
            extracted_json: str,
            confidence: float,
    ) -> str:
        import uuid
        import json
        from datetime import datetime, timezone

        review_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        try:
            trial_title = json.loads(extracted_json).get("trial_title", trial_id)
        except (ValueError, AttributeError):
            trial_title = trial_id

        with self.driver.session() as session:
            session.run(
                """
                CREATE (:PendingReview {
                    id:             $id,
                    trial_id:       $trial_id,
                    trial_title:    $trial_title,
                    text:           $text,
                    extracted_json: $extracted_json,
                    confidence:     $confidence,
                    created_at:     $now
                })
                """,
                id=review_id,
                trial_id=trial_id,
                trial_title=trial_title,
                text=text,
                extracted_json=extracted_json,
                confidence=confidence,
                now=now,
            )
        logger.info(
            "Trial %s queued for review (confidence=%.2f, review_id=%s)",
            trial_id, confidence, review_id,
        )
        return review_id

    def list_pending_reviews(self) -> list[dict]:
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (r:PendingReview)
                RETURN r.id            AS id,
                       r.trial_id      AS trial_id,
                       r.trial_title   AS trial_title,
                       r.confidence    AS confidence,
                       r.created_at    AS created_at,
                       r.extracted_json AS extracted_json
                ORDER BY r.created_at DESC
                """
            )
            return [dict(row) for row in result]

    def approve_pending_review(self, review_id: str) -> str | None:
        """Promote a PendingReview to a real Trial. Returns trial_id on success."""
        from src.schema import ExtractedEntities
        from src.coding import map_to_icd10

        with self.driver.session() as session:
            result = session.run(
                "MATCH (r:PendingReview {id: $id}) RETURN r",
                id=review_id,
            )
            row = result.single()
            if not row:
                return None
            r = dict(row["r"])

        try:
            entities = ExtractedEntities.model_validate_json(r["extracted_json"])
        except Exception as ex:
            logger.error("Failed to deserialize PendingReview %s: %s", review_id, ex)
            return None

        # Re-enrich ICD-10 for any conditions still missing codes
        for cond in entities.conditions_treated + entities.conditions_excluded:
            if cond.icd10_code is None:
                cond.icd10_code = map_to_icd10(cond.name)

        self.ingest_trial(trial_id=r["trial_id"], extracted_data=entities)

        with self.driver.session() as session:
            session.run(
                "MATCH (r:PendingReview {id: $id}) DELETE r",
                id=review_id,
            )
        return r["trial_id"]

    def reject_pending_review(self, review_id: str) -> bool:
        with self.driver.session() as session:
            check = session.run(
                "MATCH (r:PendingReview {id: $id}) RETURN count(r) AS n",
                id=review_id,
            )
            row = check.single()
            if not row or row["n"] == 0:
                return False
            session.run(
                "MATCH (r:PendingReview {id: $id}) DELETE r",
                id=review_id,
            )
            return True

    # ── Patient profile CRUD ───────────────────────────────────────────────────

    def create_patient_profile(
            self,
            name: str,
            age: int | None,
            gender: str | None,
            conditions: list[str],
            medications: list[str],
            notes: str | None,
    ) -> dict:
        profile_id = str(uuid.uuid4())
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        with self.driver.session() as session:
            session.run(
                """
                CREATE (:PatientProfile {
                    id: $id,
                    name: $name,
                    age: $age,
                    gender: $gender,
                    conditions: $conditions,
                    medications: $medications,
                    notes: $notes,
                    created_at: $now,
                    updated_at: $now
                })
                """,
                id=profile_id,
                name=name,
                age=age,
                gender=gender,
                conditions=conditions,
                medications=medications,
                notes=notes,
                now=now,
            )
        return dict(
            id=profile_id, name=name, age=age, gender=gender,
            conditions=conditions, medications=medications, notes=notes,
            created_at=now, updated_at=now,
        )

    def get_patient_profile(self, profile_id: str) -> dict | None:
        with self.driver.session() as session:
            result = session.run(
                "MATCH (p:PatientProfile {id: $id}) RETURN p",
                id=profile_id,
            )
            row = result.single()
            if not row:
                return None
            return dict(row["p"])

    def list_patient_profiles(self) -> list[dict]:
        with self.driver.session() as session:
            result = session.run(
                "MATCH (p:PatientProfile) RETURN p ORDER BY p.created_at DESC"
            )
            return [dict(r["p"]) for r in result]

    def update_patient_profile(self, profile_id: str, updates: dict) -> dict | None:
        from datetime import datetime, timezone
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        with self.driver.session() as session:
            result = session.run(
                "MATCH (p:PatientProfile {id: $id}) SET p += $props RETURN p",
                id=profile_id,
                props=updates,
            )
            row = result.single()
            if not row:
                return None
            return dict(row["p"])

    def delete_patient_profile(self, profile_id: str) -> bool:
        with self.driver.session() as session:
            result = session.run(
                "MATCH (p:PatientProfile {id: $id}) DELETE p RETURN count(p) AS n",
                id=profile_id,
            )
            row = result.single()
            return bool(row and row["n"] > 0)

    @staticmethod
    def _create_graph_topology(
            tx,
            trial_id: str,
            extracted_entity: ExtractedEntities,
            phase: str | None = None,
            status: str | None = None,
    ):
        # 1. Create the central Trial node
        tx.run(
            """
            MERGE (t:Trial {id: $trial_id})
            ON CREATE SET t.min_age = $min_age,
                        t.max_age = $max_age,
                        t.title   = $trial_title,
                        t.phase   = $phase,
                        t.status  = $status
            ON MATCH SET  t.title  = $trial_title,
                        t.phase   = $phase,
                        t.status  = $status
            """,
            trial_id=trial_id,
            trial_title=extracted_entity.trial_title,
            min_age=extracted_entity.eligibility.min_age,
            max_age=extracted_entity.eligibility.max_age,
            phase=phase,
            status=status,
        )

        # 2. Treated conditions — with optional ICD-10 code
        if extracted_entity.conditions_treated:
            tx.run(
                """
                UNWIND $conditions AS cond
                MATCH (t:Trial {id: $trial_id})
                MERGE (c:Condition {name: cond.name})
                ON CREATE SET c.icd10_code = cond.code
                ON MATCH SET  c.icd10_code = COALESCE(cond.code, c.icd10_code)
                MERGE (t)-[:TREATS]->(c)
                """,
                trial_id=trial_id,
                conditions=[
                    {"name": c.name, "code": c.icd10_code}
                    for c in extracted_entity.conditions_treated
                ],
            )

        # 3. Used medications (no ICD codes — unchanged)
        if extracted_entity.medications_used:
            tx.run(
                """
                UNWIND $names AS name
                MATCH (t:Trial {id: $trial_id})
                MERGE (m:Medication {name: name})
                MERGE (t)-[:USES_MEDICATION]->(m)
                """,
                trial_id=trial_id,
                names=[m.name for m in extracted_entity.medications_used],
            )

        # 4. Excluded conditions — with optional ICD-10 code
        if extracted_entity.conditions_excluded:
            tx.run(
                """
                UNWIND $conditions AS cond
                MATCH (t:Trial {id: $trial_id})
                MERGE (c:Condition {name: cond.name})
                ON CREATE SET c.icd10_code = cond.code
                ON MATCH SET  c.icd10_code = COALESCE(cond.code, c.icd10_code)
                MERGE (t)-[:EXCLUDES_CONDITION]->(c)
                """,
                trial_id=trial_id,
                conditions=[
                    {"name": c.name, "code": c.icd10_code}
                    for c in extracted_entity.conditions_excluded
                ],
            )

        # 5. Excluded medications (no ICD codes — unchanged)
        if extracted_entity.medications_excluded:
            tx.run(
                """
                UNWIND $names AS name
                MATCH (t:Trial {id: $trial_id})
                MERGE (m:Medication {name: name})
                MERGE (t)-[:EXCLUDES_MEDICATION]->(m)
                """,
                trial_id=trial_id,
                names=[m.name for m in extracted_entity.medications_excluded],
            )


if __name__ == "__main__":
    from src.extract import extract_trial_data

    sample_text = """
    This phase 3 clinical trial investigates the efficacy of Metformin 
    for treating Type 2 Diabetes. 
    Patients must be between 18 and 65 years old. 
    Exclusion criteria: Patients with severe kidney disease or those currently taking Insulin.
    """

    # Run extraction
    data = extract_trial_data(sample_text)

    # Ingest into Neo4j
    gm = GraphManager()

    try:
        gm.ingest_trial(trial_id="NCT001", extracted_data=data)
    finally:
        gm.close()
