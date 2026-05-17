import os
import re
import json
import logging
import warnings
from typing import List, Dict, Any
from typing_extensions import TypedDict, NotRequired
from dotenv import load_dotenv
from neo4j import GraphDatabase, Query
from typing import cast, LiteralString
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END

warnings.filterwarnings("ignore", category=DeprecationWarning)

load_dotenv()

logger = logging.getLogger(__name__)

try:
    NEO4J_URI = os.environ["NEO4J_URI"]
    NEO4J_USER = os.environ["NEO4J_USER"]
    NEO4J_PASSWORD = os.environ["NEO4J_PASSWORD"]
except KeyError as e:
    raise ValueError(f"Missing required environment variable: {e}")

_neo4j_driver = None


def _get_driver():
    global _neo4j_driver
    if _neo4j_driver is None:
        _neo4j_driver = GraphDatabase.driver(
            NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)
        )
    return _neo4j_driver


llm = ChatOllama(
    model="llama3",
    temperature=0,
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
)

# ── State ─────────────────────────────────────────────────────────────────────


class GraphState(TypedDict):
    patient_query: str
    analyzed_profile: NotRequired[str]
    cypher_query: NotRequired[str]
    db_results: NotRequired[List[Dict[str, Any]]]
    scored_trials: NotRequired[List[Dict[str, Any]]]
    final_verdict: NotRequired[str]
    error_message: NotRequired[str]
    retry_count: NotRequired[int]
    phase_filter: NotRequired[str]  # e.g. "PHASE3"
    status_filter: NotRequired[str]  # e.g. "RECRUITING"


# ── Node 1: Analyze the patient query ────────────────────────────────────────


def analyze_query(state: GraphState) -> dict:
    logger.info("NODE: Analyzing patient query")

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                """You are a medical data parser. Extract the following fields from the patient description:
            - age: integer (e.g. 55)
            - gender: one of Male, Female, All
            - conditions: comma-separated list of medical conditions (e.g. type 2 diabetes, hypertension)
            - medications: comma-separated list of current medications (e.g. metformin, insulin)

            OUTPUT FORMAT — output only this block, no extra text:
                Age: <value or unknown>
                Gender: <Male|Female|All|unknown>
                Conditions: <comma-separated or none>
                Medications: <comma-separated or none>""",
            ),
            ("human", "{query}"),
        ]
    )

    chain = prompt | llm
    result = chain.invoke({"query": state["patient_query"]})
    analyzed = str(result.content).strip()
    logger.info("Analyzed profile: %s", analyzed)
    return {"analyzed_profile": analyzed, "retry_count": state.get("retry_count", 0)}


# ── Node 2: Generate Cypher ───────────────────────────────────────────────────


def generate_cypher(state: GraphState) -> dict:
    logger.info("NODE: Generating Cypher (attempt %d)", state.get("retry_count", 0) + 1)

    error_context = ""
    if state.get("error_message"):
        error_context = (
            "\nPREVIOUS ATTEMPT FAILED WITH THIS ERROR:\n"
            f"{state.get('error_message', '')}\n"
            "Fix the query based on the error above. Do not repeat the same mistake.\n"
        )

    phase_filter: str = state.get("phase_filter", "")
    status_filter: str = state.get("status_filter", "")
    active_filters = ""
    if phase_filter or status_filter:
        lines = []
        if phase_filter:
            lines.append(f'AND t.phase = "{phase_filter}"')
        if status_filter:
            lines.append(f'AND t.status = "{status_filter}"')
        active_filters = (
            "\nACTIVE FILTERS — you MUST include ALL of these additional WHERE clauses:\n"
            + "\n".join(f"  {ln}" for ln in lines)
            + "\n"
        )

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                f"""You are a Neo4j Cypher expert. Convert the structured patient profile into a Cypher query.

GRAPH SCHEMA:
- (t:Trial)      properties: id, min_age, max_age, title,
                             phase  (e.g. "PHASE1","PHASE2","PHASE3","PHASE4" — may be null),
                             status (e.g. "RECRUITING","ACTIVE_NOT_RECRUITING","COMPLETED" — may be null)
- (c:Condition)  properties: name (always lowercase), icd10_code (optional, e.g. "E11.9")
- (m:Medication) property:   name (always lowercase)
- Relationships: (t)-[:TREATS]->(c), (t)-[:EXCLUDES_CONDITION]->(c),
                 (t)-[:USES_MEDICATION]->(m), (t)-[:EXCLUDES_MEDICATION]->(m)

RULES:
1. Match trials that TREAT the patient's condition.
   - Prefer exact ICD-10 match when you know the code: c.icd10_code = "<code>"
   - Always include a name fallback: OR toLower(c.name) CONTAINS "<term>"
   - Combine with OR so either match works.
2. Filter by age: t.min_age <= <age> AND t.max_age >= <age> (skip if age unknown).
3. Exclude trials where the patient's current medication appears under EXCLUDES_MEDICATION.
4. Return t.id AS trial_id, t.title AS trial_title.
5. LIMIT 10.
6. Output ONLY the raw Cypher query — no markdown, no backticks, no explanation.
{active_filters}{error_context}
EXAMPLE (type 2 diabetes, 55yo, Phase 3, Recruiting):
MATCH (t:Trial)-[:TREATS]->(c:Condition)
WHERE (c.icd10_code = "E11" OR toLower(c.name) CONTAINS "diabetes")
AND t.min_age <= 55 AND t.max_age >= 55
AND t.phase = "PHASE3"
AND t.status = "RECRUITING"
RETURN t.id AS trial_id, t.title AS trial_title
LIMIT 10""",
            ),
            ("human", "Structured Patient Profile:\n{profile}"),
        ]
    )

    chain = prompt | llm
    result = chain.invoke(
        {"profile": state.get("analyzed_profile", state["patient_query"])}
    )

    raw = str(result.content)
    clean_query = raw.replace("```cypher", "").replace("```", "").strip()
    logger.info("Generated Cypher: %s", clean_query)

    return {
        "cypher_query": clean_query,
        "error_message": "",
    }


# ── Node 3: Execute Cypher ────────────────────────────────────────────────────


def execute_query(state: GraphState) -> dict:
    logger.info("NODE: Executing Cypher against Neo4j")

    try:
        driver = _get_driver()
        with driver.session() as session:
            cypher = state.get("cypher_query", "")
            safe_cypher = cast(LiteralString, cypher)
            result = session.run(Query(safe_cypher))
            records_data = [record.data() for record in result]
        logger.info("DB returned %d record(s).", len(records_data))
        return {"db_results": records_data, "error_message": ""}
    except Exception as ex:
        logger.warning("DB error: %s", ex)
        return {
            "db_results": [],
            "error_message": str(ex),
            "retry_count": state.get("retry_count", 0) + 1,
        }


# ── Node 4: Score matches ─────────────────────────────────────────────────────


def score_matches(state: GraphState) -> dict:
    logger.info("NODE: Scoring trial matches")

    db_results = state.get("db_results", [])
    if not db_results:
        logger.info("No trials to score.")
        return {"scored_trials": []}

    trials_text = "\n".join(
        f"- ID: {r.get('trial_id', '?')} | Title: {r.get('trial_title', '?')}"
        for r in db_results
    )

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                """You are a clinical trial eligibility scorer.

For each trial listed, score how well the patient matches on a scale of 0 to 100.
Output ONLY a valid JSON array — no markdown fences, no explanation, nothing else:
[
  {{
    "trial_id": "<id>",
    "trial_title": "<title>",
    "score": <integer 0-100>,
    "reasons": ["<matching factor>", "..."],
    "concerns": ["<potential issue>", "..."]
  }}
]

Scoring guide:
  80-100 = strong match (condition treated, age/gender fit, no obvious exclusions)
  50-79  = partial match (condition matches, minor concerns worth reviewing)
  0-49   = weak match (limited overlap or likely excluded by criteria)

Keep each reason and concern to one concise sentence. Max 3 reasons and 2 concerns per trial.""",
            ),
            ("human", "Patient Profile:\n{profile}\n\nTrials to score:\n{trials}"),
        ]
    )

    chain = prompt | llm
    result = chain.invoke(
        {
            "profile": state.get("analyzed_profile", state["patient_query"]),
            "trials": trials_text,
        }
    )

    raw = str(result.content).strip()

    # Try direct JSON parse; fall back to extracting first [...] block
    scored: list | None = None
    try:
        scored = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if m:
            try:
                scored = json.loads(m.group())
            except json.JSONDecodeError:
                pass

    if not isinstance(scored, list):
        logger.warning(
            "score_matches: could not parse LLM JSON output; using fallback scores."
        )
        scored = [
            {
                "trial_id": r.get("trial_id", ""),
                "trial_title": r.get("trial_title", ""),
                "score": 50,
                "reasons": ["Matched by graph query"],
                "concerns": [],
            }
            for r in db_results
        ]

    scored.sort(key=lambda x: x.get("score", 0), reverse=True)
    logger.info("Scored %d trial(s).", len(scored))
    return {"scored_trials": scored}


# ── Node 5: Evaluate results ──────────────────────────────────────────────────


def evaluate_results(state: GraphState) -> dict:
    logger.info("NODE: Evaluating match results")

    scored = state.get("scored_trials", [])
    if scored:
        results_context = "\n".join(
            f"- {t.get('trial_id')}: {t.get('trial_title')} (Score: {t.get('score')}/100)"
            for t in scored
        )
    else:
        results_context = str(state.get("db_results", []))

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                """You are a clinical trial matching assistant.
            Review the patient profile and the scored trial results.
            - If trials were found, summarise the top matches and briefly explain why each is relevant.
            - Reference the match scores when appropriate.
            - If results are empty, state that no active trials were found.
            Keep your response concise and professional.""",
            ),
            ("human", "Patient Profile: {query}\n\nMatched Trials:\n{results}"),
        ]
    )

    chain = prompt | llm
    result = chain.invoke(
        {
            "query": state["patient_query"],
            "results": results_context,
        }
    )
    return {"final_verdict": str(result.content)}


# ── Routing logic ─────────────────────────────────────────────────────────────

MAX_RETRIES = 2


def should_retry(state: GraphState) -> str:
    error = state.get("error_message", "")
    retries = state.get("retry_count", 0)
    if error and retries < MAX_RETRIES:
        logger.info("Retrying Cypher generation (attempt %d/%d)", retries, MAX_RETRIES)
        return "retry"
    return "proceed"


# ── Build and compile ─────────────────────────────────────────────────────────


def build_agent():
    workflow = StateGraph(GraphState)

    workflow.add_node("analyze_query", analyze_query)
    workflow.add_node("generate_cypher", generate_cypher)
    workflow.add_node("execute_query", execute_query)
    workflow.add_node("score_matches", score_matches)
    workflow.add_node("evaluate_results", evaluate_results)

    workflow.set_entry_point("analyze_query")
    workflow.add_edge("analyze_query", "generate_cypher")
    workflow.add_edge("generate_cypher", "execute_query")
    workflow.add_conditional_edges(
        "execute_query",
        should_retry,
        {"retry": "generate_cypher", "proceed": "score_matches"},
    )
    workflow.add_edge("score_matches", "evaluate_results")
    workflow.add_edge("evaluate_results", END)

    return workflow.compile()


app = build_agent()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    initial_state: GraphState = {"patient_query": "55yo male with Type 2 Diabetes."}
    print("Initiating LangGraph Agent...\n")
    final_state = app.invoke(initial_state)
    print("\n==================================")
    print("FINAL AGENT VERDICT:")
    print("==================================")
    print(final_state["final_verdict"])
