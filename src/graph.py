import os
import logging
import threading
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

    def close(self):
        if GraphManager._driver is not None:
            GraphManager._driver.close()
            GraphManager._driver = None

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
