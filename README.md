# 🧬 Clinical Trial Matching System

An AI-powered clinical trial matching system that takes a patient profile in natural language and finds the most relevant clinical trials from a Neo4j knowledge graph — with scoring, reasoning, and real-time streaming.

> **"55yo male with Type 2 Diabetes on Metformin"** → ranked trial matches with scores, reasons, concerns, drug interaction warnings, and side effect risks, streamed live.

---

## ✨ Features

| Feature                        | Description                                                                                                |
|--------------------------------|------------------------------------------------------------------------------------------------------------|
| 🔍 **Smart Matching**          | LangGraph agent generates Cypher queries dynamically and scores each match 0–100 with reasons and concerns |
| ⚡ **SSE Streaming**            | Real-time agent progress streamed to the UI — watch each pipeline node complete live                       |
| 🏥 **FHIR Import**             | Paste a FHIR R4 Bundle (Patient + Condition + Medication resources) for instant matching                   |
| 📊 **Batch Matching**          | Upload a CSV of patient profiles and download results in bulk                                              |
| 🕸️ **Graph Visualiser**       | Force-directed canvas showing trial → condition → medication relationships                                 |
| 💊 **Drug Interaction Check**  | OpenFDA API cross-checks patient medications against trial medications in real time                        |
| ⚠️ **Side Effect Risks**       | Adverse reaction data from OpenFDA cross-referenced against patient conditions per trial                   |
| 🗂️ **ICD-10 Mapping**         | Conditions automatically mapped to ICD-10 codes via NIH NLM API for precise matching                       |
| 📋 **Watchlist**               | Save patient profiles and re-run matching automatically to detect new trials                               |
| 🔁 **Reverse Matching**        | Ask "Who fits this trial?" — LLM generates the ideal patient profile from trial data                       |
| 🗓️ **Auto-Seeding**           | APScheduler re-seeds trials from ClinicalTrials.gov weekly (configurable)                                  |
| 📄 **PDF Export**              | Download a formatted match report as a PDF with scores, verdicts, and warnings                             |
| 📦 **FHIR Export**             | Export match results as a FHIR R4 Bundle (Patient + ResearchStudy + RiskAssessment)                        |
| ⚡ **Redis Caching**            | Match results cached by SHA-256 key with 1-hour TTL; graceful degradation if Redis is unavailable          |
| 🎛️ **Phase & Status Filters** | Filter trials by phase (I–IV) and recruitment status                                                       |
| 🔎 **Trial Search**            | Full-text search across all seeded trials with phase/status filters and pagination                         |
| 🗃️ **Trial Detail**           | Per-trial detail drawer showing conditions, medications, exclusions, age range, and ideal profile          |
| 📈 **Dashboard**               | Aggregate stats: trial counts, phase distribution, status breakdown, condition trends                      |
| ⚖️ **Trial Comparison**        | Select up to N trials and compare them side-by-side in a modal table                                       |
| 🔗 **Similar Trials**          | Graph traversal finds trials that share conditions or medications with a matched trial                     |
| 🕐 **Match History**           | Every match is saved; re-run previous searches with one click                                              |
| 📝 **Clinician Notes**         | Attach free-text notes to watchlist profiles with auto-save and timestamps                                 |
| 💉 **Medication Explorer**     | Search medications and see which trials use them, co-occurring conditions, and OpenFDA warnings            |
| ✅ **Eligibility Explainer**    | Per-criterion pass/fail breakdown for a specific patient against a specific trial                          |
| 👤 **Patient Profiles**        | Store structured patient records (name, age, gender, conditions, medications) and match directly           |
| 🩺 **Graph Quality Dashboard** | Health score with issue breakdown; one-click bulk ICD-10 fix for incomplete data                           |
| 🔬 **Extraction Confidence**   | Low-confidence extractions are quarantined for human review before entering the graph                      |
| 🤖 **Multi-LLM Support**       | Switch between Ollama (local), OpenAI, and Anthropic from the UI — no restart needed                       |

---

## 🏗️ Architecture

```text
Patient Profile (text / FHIR / CSV)
        │
        ▼
┌────────────────────────────────────┐
│      LangGraph Agent (5 nodes)     │
│  1. analyze_query                  │
│  2. generate_cypher  ──retry──┐    │
│  3. execute_query   ──error──►┘    │
│  4. score_matches                  │
│  5. evaluate_results               │
└──────────────┬─────────────────────┘
               │
        ┌──────▼──────┐
        │   Neo4j 5   │  ← knowledge graph built by LLM
        │  Knowledge  │     from ClinicalTrials.gov data
        │   Graph     │
        └─────────────┘
               │
    MatchResponse { verdict, scored_trials, cypher, warnings, side_effect_flags }
               │
        ┌──────▼──────┐
        │  Next.js 16 │  ← SSE stream, graph canvas, PDF/FHIR export
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

(SavedProfile    {id, profile_text, created_at, last_trial_ids, notes, notes_updated_at})
(MatchHistory    {id, profile, top_trial_id, top_trial_title, top_score, total_matches, created_at})
(PatientProfile  {id, name, age, gender, conditions[], medications[], notes, created_at, updated_at})
(PendingReview   {id, trial_id, trial_title, text, extracted_json, confidence, created_at})
```

### Ingestion Pipeline

```text
ClinicalTrials.gov API v2
        ↓  (ThreadPoolExecutor, 3 workers)
LLM Entity Extraction → ICD-10 Mapping → Confidence Score
        ↓ (≥ 0.6)                    ↓ (< 0.6)
Neo4j MERGE + UNWIND         PendingReview queue → human approval
```

---

## 🛠️ Tech Stack

**Backend:**
- [FastAPI](https://fastapi.tiangolo.com/) + uvicorn
- [LangGraph](https://github.com/langchain-ai/langgraph) — agent orchestration
- [LangChain](https://python.langchain.com/) — LLM chains and structured output
- [Ollama](https://ollama.com/) (Llama 3, local) / OpenAI / Anthropic — pluggable via `get_llm()`
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
- [lucide React](https://lucide.dev/) — icons

**Infrastructure:**
- Docker + Docker Compose (Neo4j + Redis + API)
- Pytest — 122 tests across 7 files, fully mocked (no external services needed)

---

## 🚀 Getting Started

See [`how_to_run.md`](how_to_run.md) for the full step-by-step guide including first-time setup, subsequent runs, and teardown.

### Quick start

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Start Ollama
brew services start ollama

# 3. Start backend
conda activate graphrag_env
uvicorn src.api:app --reload --port 8000

# 4. Seed the knowledge graph (new terminal)
python -m src.seed          # ~10–20 min first time

# 5. Start frontend (new terminal)
cd frontend && npm run dev  # http://localhost:3000
```

### Environment variables (`.env`)

| Variable              | Default                  | Description                                            |
|-----------------------|--------------------------|--------------------------------------------------------|
| `NEO4J_URI`           | `bolt://localhost:7687`  | Neo4j connection URI                                   |
| `NEO4J_USER`          | `neo4j`                  | Neo4j username                                         |
| `NEO4J_PASSWORD`      | —                        | Neo4j password                                         |
| `REDIS_URL`           | `redis://localhost:6379` | Redis URL (optional)                                   |
| `SEED_INTERVAL_HOURS` | `168`                    | Hours between automatic re-seeds                       |
| `SEED_LIMIT`          | `100`                    | Trials fetched per seed run                            |
| `SEED_ON_STARTUP`     | `false`                  | Seed immediately on API start                          |
| `LLM_PROVIDER`        | `ollama`                 | LLM provider: `ollama` \| `openai` \| `anthropic`      |
| `LLM_MODEL`           | `llama3`                 | Model name, e.g. `llama3`, `gpt-4o`, `claude-opus-4-5` |
| `OPENAI_API_KEY`      | —                        | Required when `LLM_PROVIDER=openai`                    |
| `ANTHROPIC_API_KEY`   | —                        | Required when `LLM_PROVIDER=anthropic`                 |

---

## 🤖 Multi-LLM Support

The default LLM is **Ollama / llama3** — fully local, no API key needed.

To switch provider at runtime, click the **gear icon ⚙** in the top navbar, select your provider and model, and click **Apply**. The selection persists in `localStorage` and is forwarded to the backend as query parameters on every match request.

Supported providers and models:

| Provider       | Models                                               |
|----------------|------------------------------------------------------|
| Ollama (local) | llama3, llama3.1, llama3.2, mistral, gemma2          |
| OpenAI         | gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo      |
| Anthropic      | claude-opus-4-5, claude-sonnet-4-5, claude-haiku-3-5 |

---

## 📡 API Reference

Interactive docs: `http://localhost:8000/docs`

**Matching**

| Method | Endpoint                        | Description                          |
|--------|---------------------------------|--------------------------------------|
| `POST` | `/api/v1/patients/match`        | Match patient profile (Redis cached) |
| `POST` | `/api/v1/patients/match/stream` | Match with SSE streaming             |
| `POST` | `/api/v1/patients/match/fhir`   | Match from FHIR R4 Bundle            |
| `POST` | `/api/v1/patients/match/batch`  | Batch CSV matching                   |
| `GET`  | `/api/v1/history`               | Recent match history                 |

**Trials**

| Method | Endpoint                               | Description                           |
|--------|----------------------------------------|---------------------------------------|
| `GET`  | `/api/v1/trials/search`                | Search/filter trials                  |
| `GET`  | `/api/v1/trials/{id}`                  | Trial detail                          |
| `POST` | `/api/v1/trials/ingest`                | Ingest a single trial                 |
| `POST` | `/api/v1/trials/{id}/eligible-profile` | Reverse match — ideal patient profile |
| `GET`  | `/api/v1/trials/{id}/similar`          | Similar trials by graph overlap       |
| `POST` | `/api/v1/trials/{id}/eligibility`      | Per-criterion eligibility breakdown   |
| `GET`  | `/api/v1/trials/review`                | List pending review queue             |
| `POST` | `/api/v1/trials/review/{id}/approve`   | Approve a pending trial               |
| `POST` | `/api/v1/trials/review/{id}/reject`    | Reject a pending trial                |

**Graph**

| Method | Endpoint                          | Description                        |
|--------|-----------------------------------|------------------------------------|
| `GET`  | `/api/v1/graph/subgraph`          | Fetch graph data for visualisation |
| `GET`  | `/api/v1/graph/stats`             | Aggregate graph statistics         |
| `GET`  | `/api/v1/graph/conditions`        | Condition list with trial counts   |
| `GET`  | `/api/v1/graph/quality`           | Graph quality health report        |
| `POST` | `/api/v1/graph/quality/fix-icd10` | Bulk-fix missing ICD-10 codes      |

**Watchlist & Patients**

| Method   | Endpoint                        | Description                      |
|----------|---------------------------------|----------------------------------|
| `GET`    | `/api/v1/watchlist`             | List saved profiles              |
| `POST`   | `/api/v1/watchlist`             | Save a profile                   |
| `DELETE` | `/api/v1/watchlist/{id}`        | Delete a profile                 |
| `POST`   | `/api/v1/watchlist/run`         | Re-run matching for all profiles |
| `PATCH`  | `/api/v1/watchlist/{id}/notes`  | Update clinician notes           |
| `GET`    | `/api/v1/patient-profiles`      | List patient profiles            |
| `POST`   | `/api/v1/patient-profiles`      | Create patient profile           |
| `GET`    | `/api/v1/patient-profiles/{id}` | Get patient profile              |
| `PATCH`  | `/api/v1/patient-profiles/{id}` | Update patient profile           |
| `DELETE` | `/api/v1/patient-profiles/{id}` | Delete patient profile           |

**Medications & Admin**

| Method | Endpoint                     | Description                                  |
|--------|------------------------------|----------------------------------------------|
| `GET`  | `/api/v1/medications/search` | Search medications                           |
| `GET`  | `/api/v1/medications/{name}` | Medication detail + OpenFDA interaction text |
| `POST` | `/api/v1/admin/seed`         | Trigger an immediate seed run                |
| `GET`  | `/api/v1/admin/seed/status`  | Next scheduled seed time                     |
| `GET`  | `/health`                    | Health check                                 |

---

## 🧪 Tests

```bash
pytest tests/ -v
```

122 tests across 7 files — all fully mocked, no Ollama, Neo4j, or Redis required.

| File | What it covers |
|------|----------------|
| `test_schema.py` | Condition/Medication normalisation, age range validation, gender normalisation, full entity construction (18 tests) |
| `test_api.py` | `/health`, `/patients/match` (success, failure, filters, interaction enrichment), `/trials/ingest` (14 tests) |
| `test_agent.py` | `should_retry` routing, `analyze_query`, `execute_query` error/retry, `generate_cypher` filter injection, `score_matches` JSON fallbacks and sort order (21 tests) |
| `test_seed.py` | `_parse_study` (valid, empty, drug filtering, phase/status extraction), `fetch` HTTP call, `_process_trial` (14 tests) |
| `test_interactions.py` | OpenFDA response parsing, `warnings_for_trial`, `check_interactions`, `_extract_patient_meds` (27 tests) |
| `test_extract.py` | `assess_extraction_confidence` — float parsing, regex fallback, LLM exception → 1.0, text truncation, threshold boundary checks (13 tests) |
| `test_dependencies.py` | `get_llm()` caching, provider branching (ollama/openai/anthropic), env var defaults, `make_cache_key` normalisation, Redis cache helpers (25 tests) |

---

## 📁 Project Structure

```text
├── src/
│   ├── agent.py            # LangGraph 5-node workflow
│   ├── graph.py            # Neo4j GraphManager (singleton)
│   ├── extract.py          # LLM entity extraction + confidence scoring
│   ├── coding.py           # ICD-10 mapping (NIH NLM API)
│   ├── interactions.py     # Drug interactions + side effects (OpenFDA)
│   ├── watchlist.py        # Saved profile CRUD + re-run
│   ├── scheduler.py        # APScheduler weekly seeding
│   ├── seed.py             # ClinicalTrials.gov fetcher
│   ├── dependencies.py     # Singletons + get_llm() factory
│   ├── models.py           # Pydantic API models
│   ├── schema.py           # Domain models (Condition, Medication, ScoredTrial)
│   └── routers/
│       ├── patients.py     # Match, FHIR, batch, history endpoints
│       ├── trials.py       # Ingest, search, detail, review endpoints
│       ├── graph.py        # Subgraph, stats, quality endpoints
│       ├── medications.py  # Medication search + detail
│       ├── watchlist.py    # Watchlist CRUD + run + notes
│       └── patient_profiles.py  # Patient profile CRUD
├── tests/                  # Pytest suite (fully mocked)
├── frontend/
│   └── src/
│       ├── app/page.tsx    # Root — tab state, LLM settings
│       ├── components/
│       │   ├── match/      # MatchTab, TrialCard, streaming, PDF/FHIR export
│       │   ├── graph/      # Force-directed graph visualiser
│       │   ├── watchlist/  # Saved profiles + Run All + notes
│       │   ├── ingest/     # Manual ingest + quality panel + review queue
│       │   ├── patients/   # Patient profile CRUD + Match Trials
│       │   ├── search/     # Trial search + Medication explorer
│       │   ├── dashboard/  # Stats cards + condition trends
│       │   ├── settings/   # LLM provider/model selector
│       │   └── layout/     # Navbar
│       ├── lib/api.ts      # All API calls
│       └── types/index.ts  # TypeScript interfaces
├── docker-compose.yml
├── requirements.txt
├── .env
└── how_to_run.md           # Full local setup guide
```

---

## 📄 License

© 2026 Arpith Kumar Dubey. All rights reserved.
