# Healthcare Clinical Trial Matcher (GraphRAG)

## Project Architecture & Execution Plan

### Overview

This project is an advanced multi-hop reasoning AI system that matches synthetic patient profiles to active clinical trials. It leverages a Knowledge Graph (Neo4j) for deterministic relationship mapping (GraphRAG) and LangGraph for the stateful reasoning loop.

---

### Phase 1: Infrastructure & Environment Provisioning

**Goal:** Establish a clean, containerized local environment.

1. **System Dependencies:**
   - Install **Docker Desktop** (essential for running databases).
   - Install **Ollama** natively on macOS. Pull the model: `ollama run llama3`.

2. **Database Tooling:**
   - Open **JetBrains DataSpell**.
   - Install the Neo4j JDBC driver within DataGrip to visually inspect nodes and cypher queries during development.

3. **Docker Compose Setup (`docker-compose.yml`):**
   - Define a single network.
   - **Neo4j Container:** Expose ports 7474 (HTTP) and 7687 (Bolt). Mount a volume for data persistence. Enable the `apoc` (Awesome Procedures on Cypher) plugin for advanced graph algorithms.

4. **Python Environment:**
   - Initialize Conda: `conda create -n graphrag_env python=3.14 -y && conda activate graphrag_env`
   - Core packages: `pip install fastapi uvicorn langchain langchain-community langgraph neo4j pydantic pytest pytest-asyncio`

---

### Phase 2: Data Extraction & Knowledge Graph Construction (ETL)

**Goal:** Ingest unstructured clinical trial text and convert it into structured Nodes and Edges.

1. **Data Sourcing:**
   - Fetch payload from `ClinicalTrials.gov` API (JSON format).
2. **LLM Entity Extraction:**
   - Define strict `Pydantic` schemas for:
     - **Nodes:** `Condition`, `Medication`, `Trial`, `PatientEligibility`.
     - **Edges:** `TREATS`, `EXCLUDES`, `REQUIRES`.
   - Pass trial text to Llama 3 with the Pydantic schema to force structured JSON output.
3. **Graph Ingestion:**
   - Write parameterized Cypher queries to merge extracted JSON into Neo4j.
   - **TDD Requirement:** Write Pytest integration tests to verify successful node creation and relationship mapping before moving on.

---

### Phase 3: The Orchestration Layer (LangGraph)

**Goal:** Build the cognitive loop that decides *how* to answer a patient matching query.

1. **Define the Graph State:**
   - A `TypedDict` containing the user query, extracted patient entities, generated Cypher queries, raw graph results, and final synthesized response.
2. **Define Nodes (Functions):**
   - `AnalyzeQuery`: Extracts patient traits (e.g., "55yo male, Type 2 Diabetes, takes Metformin").
   - `GenerateCypher`: Converts patient traits into a Neo4j Cypher query to find matching trials and explicit exclusions.
   - `ExecuteGraphQuery`: Runs the query against Neo4j.
   - `EvaluateMatch`: Takes the Neo4j output and reasoning context to determine a definitive "Match" or "No Match".
3. **Compile the Graph:**
   - Define conditional edges to loop back if the Cypher query fails syntax checks.

---

### Phase 4: Backend API (FastAPI)

**Goal:** Expose the LangGraph pipeline via a secure, performant REST API.

1. **Endpoints:**
   - `POST /api/v1/match` -> Accepts patient profile, triggers the LangGraph agent, returns reasoning and matched trials.
2. **Security (OWASP):**
   - Implement strict request validation using Pydantic.
   - Add CORS middleware.
   - Implement basic rate limiting.
3. **Testing:**
   - Use `TestClient` to mock LangGraph responses and validate API contracts.

---

### Phase 5: Frontend Interface (Next.js & TypeScript)

**Goal:** A clean, functional UI for data input and visualization.

1. **Setup:** `npx create-next-app@latest frontend --typescript --tailwind --app`
2. **Components:**
   - Patient Profile Form (Dynamic inputs for age, conditions, meds).
   - Results Dashboard (Displays matched trials, confidence score, and LLM reasoning steps).
3. **State Management:** React Server Components to handle API fetching securely.

---

### Execution Strategy

- We will execute this strictly Phase by Phase.
- Do not write code for Phase N+1 until Phase N has passing tests and is committed.
- All database configuration will be containerized.

**Next Step:** When ready, initiate Phase 1. We will generate the `docker-compose.yml` for Neo4j and set up the Conda environment structure.
