# 🧬 Clinical Trial Matching System

An AI-powered clinical trial matching system that takes a patient profile in natural language and finds the most relevant clinical trials from a Neo4j knowledge graph — with scoring, reasoning, and real-time streaming.

> **"55yo male with Type 2 Diabetes on Metformin"** → ranked trial matches with scores, reasons, concerns, and drug interaction warnings, streamed live.

---

## ✨ Features

| Feature | Description |
| --- | --- |
| 🔍 **Smart Matching** | LangGraph agent generates Cypher queries dynamically and scores each match 0–100 with reasons and concerns |
| ⚡ **SSE Streaming** | Real-time agent progress streamed to the UI — watch each pipeline node complete live |
| 🏥 **FHIR Import** | Paste a FHIR R4 Bundle (Patient + Condition + Medication resources) for instant matching |
| 📊 **Batch Matching** | Upload a CSV of patient profiles and download results in bulk |
| 🕸️ **Graph Visualiser** | Force-directed canvas showing trial → condition → medication relationships |
| 💊 **Drug Interaction Check** | OpenFDA API cross-checks patient medications against trial medications |
| 🗂️ **ICD-10 Mapping** | Conditions are automatically mapped to ICD-10 codes via NIH NLM API for precise matching |
| 📋 **Watchlist** | Save patient profiles and re-run matching automatically to detect new trials |
| 🔁 **Reverse Matching** | Ask "Who fits this trial?" — LLM generates the ideal patient profile from trial data |
| 🗓️ **Auto-Seeding** | APScheduler re-seeds trials from ClinicalTrials.gov weekly (configurable) |
| 📄 **PDF Export** | Download a formatted match report as a PDF with scores, verdicts, and warnings |
| ⚡ **Redis Caching** | Match results cached by SHA-256 key with 1-hour TTL; graceful degradation if Redis is unavailable |
| 🎛️ **Phase & Status Filters** | Filter trials by phase (I–IV) and recruitment status |

---

## 🏗️ Architecture

```text
Patient Profile (text / FHIR)
        │
        ▼
┌─────────────────────────────────┐
│     LangGraph Agent (5 nodes)   │
│  1. analyze_query               │
│  2. generate_cypher  ──retry──┐ │
│  3. execute_query   ──error──►┘ │
│  4. score_matches               │
│  5. evaluate_results            │
└──────────────┬──────────────────┘
               │
        ┌──────▼──────┐
        │   Neo4j 5   │  ← knowledge graph built by Llama 3
        │  Knowledge  │     from ClinicalTrials.gov data
        │   Graph     │
        └─────────────┘
               │
    MatchResponse { verdict, scored_trials, cypher, warnings }
               │
        ┌──────▼──────┐
        │  Next.js 16 │  ← SSE stream, graph canvas, PDF export
        │  Dashboard  │
        └─────────────┘
```

### Knowledge Graph Schema

```text
(Trial {id, title, min_age, max_age, phase, status})
    -[:TREATS]→              (Condition {name, icd10_code})
    -[:USES_MEDICATION]→     (Medication {name})
    -[:EXCLUDES_CONDITION]→  (Condition {name, icd10_code})
    -[:EXCLUDES_MEDICATION]→ (Medication {name})

(SavedProfile {id, profile_text, created_at, last_trial_ids})
```

---

## 🛠️ Tech Stack

**Backend:**

- [FastAPI](https://fastapi.tiangolo.com/) + Uvicorn
- [LangGraph](https://github.com/langchain-ai/langgraph) — agent orchestration
- [LangChain](https://python.langchain.com/) + [Ollama](https://ollama.com/) (Llama 3, local)
- [Neo4j 5](https://neo4j.com/) — knowledge graph
- [Redis 7](https://redis.io/) — response caching (optional)
- [APScheduler](https://apscheduler.readthedocs.io/) — scheduled seeding
- [Pydantic v2](https://docs.pydantic.dev/)

**Frontend:**

- [Next.js 16](https://nextjs.org/) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Framer Motion](https://www.framer.com/motion/) — animations
- [react-force-graph-2d](https://github.com/vasturiano/react-force-graph) — graph canvas
- [jsPDF](https://github.com/parallax/jsPDF) — client-side PDF export
- [Lucide React](https://lucide.dev/) — icons

**Infrastructure:**

- Docker + Docker Compose (Neo4j + Redis + API)
- Pytest (46 tests, fully mocked — no external services needed)

---

## 🚀 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) (for Neo4j + Redis)
- [Ollama](https://ollama.com/) with `llama3` pulled (`ollama pull llama3`)
- Python 3.11+
- Node.js 20+

### 1. Clone & configure

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

cp .env.example .env   # then fill in your values
```

`.env` variables:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
REDIS_URL=redis://localhost:6379
SEED_INTERVAL_HOURS=168
SEED_LIMIT=100
SEED_ON_STARTUP=false
```

### 2. Start infrastructure

```bash
docker compose up neo4j redis -d
```

### 3. Install & run the backend

```bash
pip install -r requirements.txt
uvicorn src.api:app --reload --port 8000
```

### 4. Seed the knowledge graph

```bash
python -m src.seed        # fetches 100 trials from ClinicalTrials.gov
```

### 5. Install & run the frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:3000
```

### Full Docker stack (optional)

```bash
docker compose up --build
```

---

## 📡 API Reference

|Method|Endpoint|Description|
|---|---|---|
|`POST`|`/api/v1/patients/match`|Match patient profile (cached)|
|`POST`|`/api/v1/patients/match/stream`|Match with SSE streaming|
|`POST`|`/api/v1/patients/match/fhir`|Match from FHIR R4 Bundle|
|`POST`|`/api/v1/patients/match/batch`|Batch CSV matching|
|`POST`|`/api/v1/trials/ingest`|Ingest a single trial|
|`GET`|`/api/v1/graph/subgraph`|Fetch graph data for visualisation|
|`POST`|`/api/v1/trials/{id}/eligible-profile`|Reverse match — ideal patient profile|
|`GET`|`/api/v1/watchlist`|List saved profiles|
|`POST`|`/api/v1/watchlist`|Save a profile|
|`DELETE`|`/api/v1/watchlist/{id}`|Delete a profile|
|`POST`|`/api/v1/watchlist/run`|Re-run matching for all saved profiles|
|`POST`|`/api/v1/admin/seed`|Trigger an immediate seed run|
|`GET`|`/api/v1/admin/seed/status`|Next scheduled seed time|
|`GET`|`/health`|Health check|

Interactive docs available at `http://localhost:8000/docs`.

---

## 🧪 Tests

```bash
pytest tests/ -v
```

All 46 tests run fully mocked — no Ollama, Neo4j, or Redis required.

---

## 📁 Project Structure

```text
├── src/
│   ├── agent.py          # LangGraph 5-node workflow
│   ├── graph.py          # Neo4j GraphManager
│   ├── extract.py        # Llama 3 entity extraction
│   ├── coding.py         # ICD-10 mapping (NIH NLM API)
│   ├── interactions.py   # Drug interaction check (OpenFDA)
│   ├── watchlist.py      # Saved profile CRUD + re-run
│   ├── scheduler.py      # APScheduler weekly seeding
│   ├── seed.py           # ClinicalTrials.gov fetcher
│   ├── dependencies.py   # Module-level singletons
│   ├── models.py         # Pydantic API models
│   └── routers/          # FastAPI route handlers
├── tests/                # Pytest suite (46 tests)
├── frontend/             # Next.js 16 dashboard
│   └── src/
│       ├── components/
│       │   ├── match/    # MatchTab, TrialCard, PDF export, streaming
│       │   ├── graph/    # Force-directed graph visualiser
│       │   ├── watchlist/# Saved profiles + Run All
│       │   └── ingest/   # Manual ingest + auto-seed panel
│       ├── lib/api.ts    # All API calls
│       └── types/        # TypeScript interfaces
├── docker-compose.yml
└── requirements.txt
```

---

## ⚙️ Configuration

| Variable | Default | Description |
| ---------- | --------- | ------------- |
| `SEED_INTERVAL_HOURS` | `168` | Hours between automatic re-seeds (168 = weekly) |
| `SEED_LIMIT` | `100` | Number of trials fetched per seed run |
| `SEED_ON_STARTUP` | `false` | Set to `true` to seed immediately on API start |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL (optional) |

---

## 📄 License

© 2026 Arpith Kumar Dubey. All rights reserved.
