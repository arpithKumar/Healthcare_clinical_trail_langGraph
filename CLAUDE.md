# CLAUDE.md — Healthcare Clinical Trial Matching System

This file is the single source of truth for project context. Read it at the start of every session before making any changes.

---

## What This Project Is

An AI-powered clinical trial matching system. Given a patient profile in natural language ("55yo male with Type 2 Diabetes"), it searches a Neo4j knowledge graph of clinical trials and returns matching trials with reasoning.

**Key differentiator:** The graph is built by extracting structured entities from raw clinical trial text using a local LLM (Llama 3 via Ollama), not manual curation. The matching itself uses a LangGraph agent that generates and executes Cypher queries dynamically, streams real-time progress via SSE, scores every matched trial 0–100 with reasons and concerns, exposes the graph visually in a force-directed canvas, supports FHIR R4 bundle import, watchlist monitoring, batch CSV matching, Redis caching, ICD-10 code mapping, and phase/status filtering.

---

## Tech Stack

| Layer | Technology |
| ------- | ----------- |
| LLM | Ollama + Llama3 (local, Metal-accelerated on M2 Max) |
| Orchestration | LangGraph |
| Knowledge Graph | Neo4j 5 Community |
| Data Extraction | LangChain with Pydantic structured output |
| Caching | Redis 7 (optional — graceful degradation if unavailable) |
| ICD-10 Mapping | NIH NLM Clinical Tables API (free, no key) |
| Backend API | FastAPI + Uvicorn |
| Frontend | Next.js 16 + TypeScript + Tailwind CSS v4 |
| UI Animations | Framer Motion |
| Icons | Lucide React |
| Graph Visualiser | react-force-graph-2d (canvas, SSR-disabled) |
| Containerisation | Docker + Docker Compose |
| Testing | Pytest (mocked — no external deps needed) |

**Developer machine:** MacBook M2 Max, 32GB unified RAM, 1TB SSD.
**Ollama config:** `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`, `OLLAMA_NUM_PARALLEL=3` set in `/opt/homebrew/Cellar/ollama/0.23.2/homebrew.mxcl.ollama.plist`. Ollama runs via `brew services start ollama`.

---

## Complete File Structure

```text
/
├── CLAUDE.md                        ← this file
├── PROJECT_PLAN_AND_ARCHITECTURE.md ← original architecture doc (outdated, CLAUDE.md takes precedence)
├── how_to_run.md
├── Dockerfile
├── docker-compose.yml               ← Neo4j + Redis + API services
├── requirements.txt                 ← includes redis==5.2.1, python-multipart==0.0.20, apscheduler==3.10.4
├── .env                             ← NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, REDIS_URL,
│                                       SEED_INTERVAL_HOURS (default 168), SEED_LIMIT (default 100),
│                                       SEED_ON_STARTUP (default false)
│
├── src/
│   ├── schema.py                    ← Pydantic domain models: Condition (+ icd10_code), Medication,
│   │                                   TrialEligibility, ExtractedEntities, ScoredTrial
│   ├── extract.py                   ← Llama3 extraction chain
│   ├── graph.py                     ← Neo4j GraphManager (singleton driver, indexes, batched writes,
│   │                                   get_subgraph, get_trial_context)
│   ├── agent.py                     ← LangGraph 5-node workflow (analyze→cypher→execute→score→evaluate)
│   │                                   GraphState includes phase_filter + status_filter; generate_cypher
│   │                                   injects active filters; icd10_code schema + ICD-first matching rule
│   ├── coding.py                    ← map_to_icd10() via NIH NLM Clinical Tables API
│   ├── interactions.py              ← check_interactions(), get_interaction_texts(),
│   │                                   warnings_for_trial() via OpenFDA drug label API
│   ├── watchlist.py                 ← WatchlistManager: SavedProfile CRUD + run_all()
│   ├── models.py                    ← API Pydantic request/response models (all in one place)
│   ├── dependencies.py              ← Module-level singletons: graph_manager, watchlist_manager,
│   │                                   redis_client, reverse_chain; cache helpers
│   ├── scheduler.py                 ← APScheduler BackgroundScheduler; start_scheduler(),
│   │                                   stop_scheduler(), trigger_seed_now(), get_next_run_time()
│   │                                   Reads SEED_INTERVAL_HOURS, SEED_LIMIT, SEED_ON_STARTUP
│   ├── seed.py                      ← ClinicalTrials.gov fetcher + concurrent ingestion + ICD enrichment
│   │                                   TrialRecord carries phase + status; _parse_study extracts both
│   ├── logging_config.py            ← Centralised logging (stdout + rotating file)
│   └── routers/
│       ├── __init__.py
│       ├── patients.py              ← /patients/match, /match/fhir, /match/stream, /match/batch
│       │                               FHIR parser, batch helper, Redis cache logic
│       │                               ?phase + ?status query params on /match + /match/stream
│       ├── graph.py                 ← /graph/subgraph
│       ├── trials.py                ← /trials/ingest (+ ICD enrichment + cache flush),
│       │                               /trials/{id}/eligible-profile
│       └── watchlist.py             ← /watchlist CRUD + /watchlist/run
│
├── tests/
│   ├── test_schema.py               ← Schema validation unit tests
│   ├── test_api.py                  ← API endpoint tests (mocked) — patch targets: src.routers.*
│   ├── test_agent.py                ← Agent node + routing tests (mocked)
│   └── test_seed.py                 ← Seed parsing + worker tests (mocked)
│
├── logs/                            ← Runtime log files (gitignored), 5MB rotating, 3 backups
│
└── frontend/
    ├── .env.local                   ← NEXT_PUBLIC_API_URL=http://localhost:8000
    ├── package.json                 ← next 16, framer-motion, lucide-react, next-themes, tailwind v4,
    │                                   react-force-graph-2d, jspdf
    └── src/
        ├── app/
        │   ├── page.tsx             ← Root: tab state + graphTrialIds state + handleVisualize
        │   ├── layout.tsx           ← ThemeProvider wrapper
        │   └── globals.css          ← Tailwind v4, dot grid pattern, shimmer animation, dark mode
        ├── types/index.ts           ← TrialResult, ScoredTrial, MatchResponse, ExtractedEntities
        │                               (Condition with icd10_code), IngestionResponse, SubgraphNode/Link/Data,
        │                               NodeStatus, ProgressEvent, ResultEvent, ErrorEvent, StreamEvent,
        │                               WatchlistProfile, WatchlistRunResult, EligibleProfileResponse,
        │                               BatchMatchResult
        ├── lib/api.ts               ← MatchFilters interface; matchPatient(), matchFhirPatient(),
        │                               streamMatchPatient() (all accept optional MatchFilters),
        │                               ingestTrial(), fetchSubgraph(), fetchEligibleProfile(),
        │                               matchPatientsBatch(), getWatchlist(), saveToWatchlist(),
        │                               deleteFromWatchlist(), runWatchlist(),
        │                               triggerSeed(), getSeedStatus()
        └── components/
            ├── ThemeProvider.tsx
            ├── ThemeToggle.tsx
            ├── layout/
            │   └── Navbar.tsx       ← Glass nav, 4-tab pills (Match / Ingest / Graph / Watchlist),
            │                           theme toggle; exports Tab type
            ├── ui/
            │   ├── EmptyState.tsx
            │   ├── ErrorBanner.tsx
            │   └── Skeleton.tsx     ← Shimmer loader
            ├── match/
            │   ├── MatchTab.tsx     ← Single/Batch pill switcher; SSE streaming; onVisualize;
            │   │                       3-button action row: Visualise Graph / Save to Watchlist /
            │   │                       Download Report; phase + status state → filters
            │   ├── PatientInput.tsx ← Free Text / FHIR JSON mode toggle + textarea;
            │   │                       Phase I/II/III/IV + Recruiting/Active/Completed filter chips
            │   │                       (text mode only); FilterChip internal component
            │   ├── VerdictCard.tsx  ← Agent verdict with indigo left border accent
            │   ├── TrialCard.tsx    ← Score bar; reasons/concerns; "Who fits?" lazy-fetch panel
            │   ├── CypherTrace.tsx  ← Collapsible Cypher debug panel
            │   ├── StreamingProgress.tsx ← Timeline: completed nodes (✓/✗) + active spinner
            │   ├── BatchUpload.tsx  ← Drag-and-drop CSV; results table; download CSV
            │   └── DownloadReportButton.tsx ← Lazy-loads jsPDF on click; builds + saves
            │                                   trial-match-YYYY-MM-DD.pdf; sky-coloured button
            ├── graph/
            │   └── GraphTab.tsx     ← ForceGraph2D inline (no wrapper file); ResizeObserver sizing;
            │                           lazy import in useEffect; legend; loading/error states
            ├── watchlist/
            │   ├── WatchlistTab.tsx ← Profiles grid, Run All button, new-match summary
            │   └── WatchlistCard.tsx ← Profile text, date, match count, amber new-match badge, delete
            └── ingest/
                ├── IngestTab.tsx    ← Auto-seed scheduler panel (next run + Seed Now button)
                │                       + manual ingest grid; triggerSeed() / getSeedStatus() calls
                ├── IngestForm.tsx   ← Trial ID input + textarea + gradient submit
                ├── EntityCard.tsx   ← Coloured entity chips with optional ICD-10 code badge
                └── IngestionResult.tsx ← Success banner + trial summary + entity grid
```

---

## Architecture Deep Dive

### Data Ingestion Pipeline

```text
ClinicalTrials.gov API v2 (JSON)
         ↓
seed.py — fetch structured fields (conditions, interventions, eligibility)
         ↓
Build structured text (labelled sections, not raw prose)
         ↓  [ThreadPoolExecutor, MAX_WORKERS=3]
extract.py — Llama3 via LangChain structured output → ExtractedEntities
         ↓
coding.py — map_to_icd10() per condition → populates Condition.icd10_code
         ↓
schema.py — Pydantic validation (normalise names, validate age range, gender)
         ↓
graph.py — Neo4j MERGE + UNWIND batched writes + ON CREATE/ON MATCH SET
           Condition nodes get icd10_code property when available
```

### Patient Matching Pipeline (LangGraph — 5 nodes)

```text
POST /api/v1/patients/match          POST /api/v1/patients/match/stream (SSE)
POST /api/v1/patients/match/fhir     POST /api/v1/patients/match/batch (CSV)
         ↓                                         ↓ (same agent, astream())
[Redis cache check — SHA256 key, 1h TTL — on match + match/fhir only]
         ↓ (cache miss)
agent.py — 5-node LangGraph workflow:
  1. analyze_query    → extract age, gender, conditions, medications as structured text
  2. generate_cypher  → LLM converts structured profile to Cypher
                        Prefers c.icd10_code = "E11" OR c.name CONTAINS "diabetes"
                        Injects ACTIVE FILTERS block when phase_filter or status_filter set
  3. execute_query    → run Cypher against Neo4j
       ↓ (error?) → retry generate_cypher with error context (max 2 retries)
  4. score_matches    → LLM scores each trial 0-100 with reasons[] + concerns[]; sorted desc
  5. evaluate_results → LLM synthesises scored results into human-readable verdict
         ↓
MatchResponse { patient_profile, executed_cypher, agent_verdict, trials[], scored_trials[] }
[Result stored in Redis — cache key includes phase + status filters]
```

### SSE Streaming Protocol

```text
POST /api/v1/patients/match/stream
  → progress event per node: {"type":"progress","node":"analyze_query","label":"...","status":"complete"|"error"}
  → on execute_query error:   status="error", agent retries generate_cypher (retry label injected)
  → final event:              {"type":"result","data":{...MatchResponse...}}
  → on exception:             {"type":"error","message":"..."}

Frontend: fetch() + ReadableStream reader (NOT EventSource — EventSource doesn't support POST bodies)
SSE stream is intentionally NOT cached — it is stateful.
```

### FHIR Import Pipeline

```text
POST /api/v1/patients/match/fhir  (body: FHIR R4 Bundle JSON)
  → _parse_fhir_bundle():
       Patient.birthDate  → age (years from today)
       Patient.gender     → "male" | "female"
       Condition.code.text → conditions list
       MedicationStatement / MedicationRequest → medications list
  → Assemble natural-language patient_query string
  → Run through existing agent (same as POST /patients/match)
  → Cache result under SHA256(patient_query)
```

### Batch Matching Pipeline

```text
POST /api/v1/patients/match/batch  (multipart/form-data: file=*.csv)
  → Parse CSV — must have 'profile' column (case-insensitive), max 50 rows
  → ThreadPoolExecutor(max_workers=3) — one agent.invoke() per row
  → future.result(timeout=150) per row — TimeoutError → error field, not crash
  → Results returned in original CSV row order
  → Frontend: drag-and-drop zone, results table, download CSV
```

### Watchlist & Background Monitoring

```text
POST /api/v1/watchlist           → save patient profile as (:SavedProfile) node in Neo4j
GET  /api/v1/watchlist           → list all saved profiles (newest first)
DELETE /api/v1/watchlist/{id}    → remove profile
POST /api/v1/watchlist/run       → re-run agent for all profiles; diff against last_trial_ids;
                                   update last_trial_ids; return new_matches per profile
seed.py __main__ — automatically calls watchlist/run after seeding completes
```

### Redis Caching

```text
dependencies.py — redis_client = redis.from_url(REDIS_URL); ping() at startup
                  If unavailable → redis_client = None (graceful degradation, one warning log)
Cache key:  trial_match:{SHA256(query.lower().strip())}
TTL:        3600 seconds (1 hour)
Cached:     POST /patients/match, POST /patients/match/fhir
NOT cached: POST /patients/match/stream (stateful SSE), POST /patients/match/batch (variable)
Invalidation: cache_flush() (flushdb) called after every successful trial ingestion
Headers:    X-Cache: HIT | MISS  +  Cache-Control: max-age=3600 | no-store
```

### ICD-10 Mapping Pipeline

```text
coding.py — map_to_icd10(condition_name) → calls NIH NLM Clinical Tables API
            https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search
            5s timeout; returns first code (e.g. "E11.9") or None on failure
            Failures are warnings only — ingestion never blocked by coding errors

Called in:
  seed.py _process_trial()  — after LLM extraction, before graph ingestion
  routers/trials.py ingest_trial() — same enrichment in manual ingest endpoint

Stored in:
  Neo4j Condition nodes: c.icd10_code (ON CREATE SET / COALESCE on match)
  Index: condition_icd10 (for fast exact-match queries)

Used in:
  agent.py generate_cypher prompt — Rule 1: prefer c.icd10_code = "E11" OR name CONTAINS fallback
  EntityCard.tsx — mono badge inside condition chip when icd10_code is present
```

### Knowledge Graph Subgraph API

```text
GET /api/v1/graph/subgraph?trial_ids=NCT001,NCT002
  → graph.py get_subgraph() — OPTIONAL MATCH (t:Trial)-[r]->(n)
  → returns { nodes: [{id, label, type}], links: [{source, target, type}] }

Frontend: GraphTab — ForceGraph2D loaded via import() inside useEffect (not next/dynamic)
  → setForceGraph(() => mod.default) — arrow wrapper prevents React treating component as updater
  → ResizeObserver drives canvas width/height (responsive)
  → queueMicrotask for setLoading(true) — avoids synchronous setState in effect body (React 19)
```

### Reverse Matching API

```text
POST /api/v1/trials/{trial_id}/eligible-profile
  → graph.py get_trial_context(trial_id) — fetches Trial node + all relationship targets
  → _reverse_chain (ChatOllama, temperature=0.3) generates 2-3 sentence ideal patient profile
  → Returns { trial_id, trial_title, ideal_profile: "..." }

Frontend: TrialCard "Who fits this trial?" button
  → Lazy-fetch on first click; result cached in component state; toggle on subsequent clicks
  → Violet-accented inline panel (AnimatePresence)
```

### Seed Scheduler

```text
api.py lifespan start → scheduler.start_scheduler()
  → BackgroundScheduler (APScheduler, UTC timezone)
  → IntervalTrigger(hours=SEED_INTERVAL_HOURS)  default 168h (weekly)
  → job id="seed_trials" calls _seed_job() in background thread
  → if SEED_ON_STARTUP=true → trigger_seed_now() fires immediately

_seed_job():
  → seed_live_trials(limit=SEED_LIMIT)  (late import, avoids circular)
  → logs INFO on success, ERROR on failure — never raises

POST /api/v1/admin/seed         → trigger_seed_now() — runs _seed_job in daemon thread, returns immediately
GET  /api/v1/admin/seed/status  → get_next_run_time() — returns ISO-8601 next run or null

api.py lifespan shutdown → scheduler.stop_scheduler() (wait=False, non-blocking)

Frontend: IngestTab scheduler panel
  → getSeedStatus() on mount → displays next run time
  → "Seed Now" button → triggerSeed() POST → setSeedTriggered(true) → re-fetches status
```

### Neo4j Graph Schema

```text
(Trial {id, title, min_age, max_age,
        phase  (e.g. "PHASE1","PHASE2","PHASE3","PHASE4" — may be null),
        status (e.g. "RECRUITING","ACTIVE_NOT_RECRUITING","COMPLETED" — may be null)})
    -[:TREATS]→             (Condition {name, icd10_code})  ← name lowercase, code optional
    -[:USES_MEDICATION]→    (Medication {name})             ← lowercase
    -[:EXCLUDES_CONDITION]→ (Condition {name, icd10_code})
    -[:EXCLUDES_MEDICATION]→(Medication {name})

(SavedProfile {id, profile_text, created_at, last_trial_ids})  ← watchlist

Indexes: trial_id, trial_phase, trial_status, condition_name, medication_name,
         condition_icd10, saved_profile_id
```

---

## Key Design Decisions (Do Not Change Without Reason)

- **Names are lowercased in schema.py** (`field_validator` on `Condition.name` and `Medication.name`). The `toLower()` in Cypher is kept as a safety net but normalisation happens at source.
- **`GraphManager` is a singleton** (`_driver` class variable, `threading.Lock` guarded). Do not create per-request instances — the driver teardown is expensive.
- **All module-level singletons live in `dependencies.py`** — `graph_manager`, `watchlist_manager`, `redis_client`, `reverse_chain`. `api.py` imports from there; routers import from there. Never instantiate these inside a request handler.
- **`api.py` is a thin app factory** — after the router split, it only contains: app creation, CORS, lifespan, health endpoint, `include_router` calls. All business logic is in `src/routers/`.
- **Test patch targets are `src.routers.*`** — after the refactor, mock at `src.routers.patients.agent_app.invoke`, `src.routers.trials.extract_trial_data`, `src.routers.trials.graph_manager.ingest_trial`, etc. — not `src.api.*`.
- **`_get_driver()` in `agent.py` has no `threading.Lock`** — unlike `GraphManager`. This is safe currently because FastAPI endpoints are synchronous (one thread per request, GIL protected). If the agent is ever made async, add a lock before calling `_get_driver()`.
- **LangGraph nodes return `dict` not `GraphState`** — partial state updates. Pylance requires `state.get("key", default)` for `NotRequired` fields.
- **`ingest_trial()` skips duplicates by default** (`overwrite=False`). Pass `overwrite=True` to force re-ingestion.
- **`seed.py` uses structured text** (labelled sections with conditions, interventions, eligibility from the ClinicalTrials.gov API) rather than raw prose. This significantly improves Llama3 extraction accuracy.
- **Ollama timeout** is enforced at `future.result(timeout=150)` in `seed.py` and `BATCH_LLM_TIMEOUT=150` in `routers/patients.py`. `ChatOllama` has no `timeout` parameter — do not attempt to add one.
- **CORS** in `api.py` allows only `GET`/`POST`/`DELETE` and `Content-Type`/`Authorization` headers from `http://localhost:3000`.
- **Frontend API URL** is read from `NEXT_PUBLIC_API_URL` env var (`.env.local`). Never hardcode `localhost:8000`.
- **`__main__` blocks** in `agent.py` and `extract.py` use `print()` and `logging.basicConfig` directly — this is intentional for quick manual script testing only. Do not replicate this pattern elsewhere.
- **SSE uses POST + fetch ReadableStream, not EventSource** — `EventSource` is GET-only and cannot send a JSON body. The streaming endpoint is `POST /api/v1/patients/match/stream`.
- **`score_matches` JSON parsing has two fallbacks** — first tries `json.loads(raw)`, then `re.search(r"\[.*\]", raw, re.DOTALL)`, then falls back to score=50 with `"Matched by graph query"`. Never crash on bad LLM output.
- **`ForceGraph2D` is loaded inside `useEffect` in `GraphTab.tsx`** — NOT via `next/dynamic`. `setForceGraph(() => mod.default)` — the arrow wrapper is critical; without it React treats the component as a state updater function. There is no `ForceGraphWrapper.tsx` file; it was eliminated.
- **`Tab` type is exported from `Navbar.tsx`** — import it from there everywhere. Do not redefine it in `page.tsx` or elsewhere.
- **Redis is optional in local dev** — `dependencies.py` calls `redis_client.ping()` at startup and sets `redis_client = None` on failure. Every cache helper (`cache_get`, `cache_set`, `cache_flush`) guards with `if redis_client is None: return`. The app runs correctly without Redis.
- **ICD-10 enrichment is post-extraction, not LLM-generated** — `Condition.icd10_code` is `None` after LLM extraction; `map_to_icd10()` is called separately and sets it before ingestion. The LLM is not asked to produce ICD codes — it might hallucinate them.
- **Batch endpoint does not accept `Content-Type: multipart/form-data` manually** — the browser sets it automatically with the boundary when using `FormData`. Do not set `Content-Type` in the `fetch()` call for the batch endpoint.
- **`run_all` in `watchlist.py` accepts `Callable[..., Any]`** — LangGraph's `invoke` is heavily overloaded; Pylance cannot narrow it to `Callable[[dict], dict]`. Use `Callable[..., Any]` to avoid type errors.
- **React 19 synchronous setState rule** — all `setState` calls in `useEffect` bodies must be inside async callbacks (`.then`, `.catch`, `.finally`, `queueMicrotask`, observer callbacks). Never call `setState` directly in the effect body.
- **`jsPDF` is imported lazily inside the click handler** — `await import("jspdf")` runs only when the user clicks "Download Report". This keeps it out of the initial bundle and avoids any SSR issues (jsPDF uses browser APIs). Do not move this import to the module top-level.
- **`buildReport()` tracks `currentY` manually** — jsPDF has no automatic page-break or flow layout. Every text block calls `checkBreak(needed)` before rendering to insert a new page when less than `needed` mm remain. Never write to fixed Y coordinates; always use the `y` variable.
- **Score bar colour is determined by score threshold** — `≥70` → emerald (16,185,129), `≥40` → amber (245,158,11), `<40` → rose (239,68,68). Same thresholds as `TrialCard.tsx`. Keep in sync if thresholds ever change.
- **Cypher trace is capped at 8 lines in the PDF** — prevents a single long query from consuming an entire page. Lines beyond 8 show `"… (N more lines omitted)"`.
- **`scheduler.py` imports `seed_live_trials` lazily** — `_seed_job()` does `from src.seed import seed_live_trials` at call time, not at module load. This prevents a circular import (`api.py` → `scheduler.py` → `seed.py` → `graph.py` → `dependencies.py`).
- **`trigger_seed_now()` is non-blocking** — it spawns a daemon thread and returns immediately. The admin endpoint `POST /api/v1/admin/seed` always returns `{"status": "started"}` instantly; it never waits for the seed to complete.
- **`stop_scheduler()` uses `wait=False`** — prevents the API shutdown from hanging while a long-running seed job finishes. The daemon thread continues until its natural end.
- **Seed env vars have safe defaults** — `SEED_INTERVAL_HOURS=168` (weekly), `SEED_LIMIT=100`, `SEED_ON_STARTUP=false`. The scheduler always starts even if the env vars are absent.

---

## How to Run

### Backend (local dev)

```bash
# Neo4j must be running (Docker)
docker compose up neo4j -d

# Redis (optional — app works without it, caching just disabled)
docker compose up redis -d

# Start API
uvicorn src.api:app --reload --port 8000

# Seed trials (first time or when you want fresh data)
python -m src.seed
```

### Frontend

```bash
cd frontend
npm install          # includes react-force-graph-2d
npm run dev          # http://localhost:3000
```

### Full Docker stack

```bash
docker compose up --build
```

### Tests

```bash
pytest tests/ -v
# No external dependencies needed — all mocked
```

### Logging

Logs go to both stdout and `logs/app.log` (5MB rotating, 3 backups). Call `setup_logging()` from entry points only (`api.py`, `seed.py`). All other modules use `logger = logging.getLogger(__name__)`.

---

## What Has Been Built and Improved (Completed)

### Backend

| File | What was built / improved |
| ------ | -------------------------- |
| `schema.py` | `field_validator` (name normalisation, empty check), `model_validator` (age range), gender normalisation, `ge=0` constraint; `ScoredTrial` model; `Condition.icd10_code` field (optional, post-extraction) |
| `graph.py` | Neo4j indexes on startup (`IF NOT EXISTS`) incl. `condition_icd10`, `trial_phase`, `trial_status`; `UNWIND` batched writes; singleton driver with `threading.Lock`; `trial_exists()` deduplication; `get_subgraph(trial_ids)`; `get_trial_context(trial_id)` for reverse matching; `get_trial_medications(trial_ids)` for interaction check; conditions UNWIND passes `{name, code}` dicts; `ingest_trial` accepts `phase`/`status`; Trial MERGE stores both |
| `interactions.py` | New — `_get_interaction_text()` (OpenFDA, 5s timeout, silent on failure); `get_interaction_texts()` (batch, one call per patient med); `warnings_for_trial()` (pure in-memory); `check_interactions()` (convenience wrapper) |
| `agent.py` | 5-node LangGraph workflow; `score_matches` JSON fallbacks; `evaluate_results` scored context; retry edge (max 2); `GraphState` has `phase_filter`/`status_filter`; `generate_cypher` always defines `prompt` (bug fix), injects ACTIVE FILTERS block when filters set, documents `phase`/`status` in GRAPH SCHEMA |
| `extract.py` | `isinstance` return type validation, `logging` replacing `print`, removed invalid `timeout` parameter |
| `coding.py` | New — `map_to_icd10()` via NIH NLM Clinical Tables API; 5s timeout; silent on failure |
| `watchlist.py` | New — `WatchlistManager`: `SavedProfile` CRUD in Neo4j, `run_all(Callable[..., Any])` with diff against `last_trial_ids` |
| `models.py` | New — all API Pydantic request/response models extracted from `api.py` |
| `dependencies.py` | New — `graph_manager`, `watchlist_manager`, `redis_client` (graceful degradation), `reverse_chain`, `make_cache_key()`, `cache_get/set/flush()` helpers |
| `scheduler.py` | New — `BackgroundScheduler` (APScheduler); `start_scheduler()` / `stop_scheduler()` called from lifespan; `trigger_seed_now()` (daemon thread); `get_next_run_time()` (ISO-8601 or None); reads `SEED_INTERVAL_HOURS`, `SEED_LIMIT`, `SEED_ON_STARTUP` from env |
| `api.py` | Added scheduler start/stop to lifespan; `POST /api/v1/admin/seed` trigger endpoint; `GET /api/v1/admin/seed/status` next-run endpoint |
| `routers/patients.py` | `/patients/match` (+ Redis cache + `?phase`/`?status` filters + interaction enrichment), `/match/fhir` (+ FHIR parser + cache + interaction enrichment), `/match/stream` (SSE + `asyncio.to_thread` interaction enrichment), `/match/batch`; `_extract_patient_meds()` parses LLM profile; `_enrich_with_interactions()` never raises; cache key includes filter values |
| `routers/graph.py` | `/graph/subgraph` |
| `routers/trials.py` | `/trials/ingest` (+ ICD enrichment + cache flush), `/trials/{id}/eligible-profile` (reverse match LLM) |
| `routers/watchlist.py` | `/watchlist` CRUD + `/watchlist/run` |
| `seed.py` | `TrialSource` Protocol; `ClinicalTrialsGovSource`; `ThreadPoolExecutor`; ICD-10 enrichment in `_process_trial`; watchlist re-run after seeding; `TrialRecord` carries `phase`/`status`; `_parse_study` extracts from `designModule.phases[0]` + `statusModule.overallStatus`; passed to `ingest_trial` |
| `logging_config.py` | Centralised `setup_logging()` with `StreamHandler` + `RotatingFileHandler` (5MB, 3 backups) |
| `docker-compose.yml` | Neo4j healthcheck; `redis:7-alpine` service with healthcheck; API `depends_on` both; `REDIS_URL` env var |
| `requirements.txt` | Added `redis==5.2.1`, `python-multipart==0.0.20`, `apscheduler==3.10.4` |

### Tests files

| File | Coverage |
| ------ | --------- |
| `test_schema.py` | Condition/Medication normalisation, age range validation, gender normalisation, empty field errors, full entity construction |
| `test_api.py` | `/health`, `/api/v1/patients/match` (success, missing field, agent failure), `/api/v1/trials/ingest` (success, missing text, extraction failure) — all mocked. Patch targets updated to `src.routers.*` |
| `test_agent.py` | `should_retry` routing logic (all branches), `analyze_query` return shape, `execute_query` error handling + retry count increment |
| `test_seed.py` | `_parse_study` (valid, no-text skip, drug-type filtering), `fetch` HTTP call, `_process_trial` (success, extraction failure) |

### Frontend components

| Component | Purpose |
| ----------- | --------- |
| `types/index.ts` | Full type inventory including `WatchlistProfile`, `WatchlistRunResult`, `EligibleProfileResponse`, `BatchMatchResult`; `ExtractedEntities` conditions carry `icd10_code` |
| `lib/api.ts` | `MatchFilters` interface exported; 10 API functions — `matchPatient()` and `streamMatchPatient()` accept optional `MatchFilters` and append `?phase`/`?status` query params |
| `globals.css` | Tailwind v4, `.bg-dot-grid` pattern, `.shimmer` keyframe animation, dark mode |
| `layout/Navbar.tsx` | Glass navbar, 4-tab pill switcher (Match / Ingest / Graph / Watchlist), theme toggle; exports `Tab` type |
| `app/page.tsx` | Root: `tab` state, `graphTrialIds` state, `handleVisualize`; renders all 4 tabs |
| `ui/Skeleton.tsx` | Shimmer skeleton blocks |
| `ui/EmptyState.tsx` | Reusable placeholder with icon + messages |
| `ui/ErrorBanner.tsx` | Animated error display |
| `match/MatchTab.tsx` | Single/Batch pill switcher; SSE streaming; FHIR mode; 3-button action row (Visualise Graph / Save to Watchlist / Download Report); `phase`/`status` state passed to `PatientInput` and forwarded as `MatchFilters` to `streamMatchPatient` |
| `match/DownloadReportButton.tsx` | Sky-coloured button; lazy-loads `jsPDF` on first click (`await import("jspdf")`); calls `buildReport()` which builds a full A4 PDF: indigo header block with trial count badge, Patient Profile section, Clinical Assessment, per-trial score bars + reasons/concerns/interaction warnings, global drug interaction summary, Cypher trace (capped at 8 lines), footer with page numbers; saves as `trial-match-YYYY-MM-DD.pdf` |
| `match/PatientInput.tsx` | Free Text / FHIR JSON mode toggle; respective textareas; Phase I/II/III/IV + Recruiting/Active/Completed `FilterChip` rows (text mode only); `PHASE_OPTIONS`/`STATUS_OPTIONS` constants; `FilterChip` internal component |
| `match/VerdictCard.tsx` | Verdict with indigo left border accent |
| `match/TrialCard.tsx` | Score bar (emerald/amber/rose); reasons/concerns expand; "Who fits?" lazy-fetch violet panel; amber `AlertTriangle` interaction warning box (always visible, not behind expand) |
| `match/CypherTrace.tsx` | Collapsible Cypher debug panel |
| `match/StreamingProgress.tsx` | Timeline: completed nodes (✓/✗) + active Loader2 spinner |
| `match/BatchUpload.tsx` | Drag-and-drop CSV zone; format hint; results table (row, profile, matches, top trial, score); download CSV |
| `graph/GraphTab.tsx` | ForceGraph2D loaded in `useEffect`; `queueMicrotask` for loading state; ResizeObserver canvas sizing; legend; all states |
| `watchlist/WatchlistTab.tsx` | Profiles grid; Run All button; new-match count banner; React-19-compliant effect |
| `watchlist/WatchlistCard.tsx` | Profile text; created date; match count; amber new-match badge; expand scored trials; delete |
| `ingest/IngestTab.tsx` | Auto-seed scheduler panel at top (next run time + "Seed Now" button with triggered feedback); manual ingest grid below; `getSeedStatus()` on mount; `triggerSeed()` on button click |
| `ingest/IngestForm.tsx` | Trial ID input + textarea + gradient submit |
| `ingest/EntityCard.tsx` | Coloured chips with optional ICD-10 mono badge; `EntityItem` interface |
| `ingest/IngestionResult.tsx` | Success banner + trial summary + entity grid; condition cards pass `{name, icd10_code}` |

---

## Planned Features (Not Yet Built)

Work through these in order. Each section below has enough detail to implement without additional context gathering.

---

### ~~Feature 1 — Streaming Agent Execution (SSE)~~ ✅ COMPLETE

**What was built:**

- `POST /api/v1/patients/match/stream` — FastAPI `StreamingResponse` using `agent_app.astream()`
- SSE events: `progress` (per node, with retry-aware label), `result` (full MatchResponse), `error`
- `streamMatchPatient()` async generator in `lib/api.ts` — POST + `ReadableStream` reader, SSE line parser with buffer
- `StreamingProgress.tsx` — framer-motion timeline of completed/active/errored nodes
- `MatchTab.tsx` — `for await` loop, `NEXT_ACTIVE_LABEL` map, progressive result reveal

---

### ~~Feature 2 — Per-Trial Match Scoring + Explanation~~ ✅ COMPLETE

**What was built:**

- `score_matches` node (Node 4 in LangGraph) — LLM outputs JSON array `[{trial_id, score, reasons[], concerns[]}]`; regex + default fallbacks; sorted desc
- `ScoredTrial` Pydantic model in `schema.py`; `scored_trials` field in `MatchResponse`
- `evaluate_results` now receives scored context (ID + score) for a richer verdict
- `TrialCard.tsx` — animated `ScoreBar` (emerald/amber/rose), expand/collapse panel with reasons (✓) and concerns (⚠)
- `MatchTab.tsx` — uses `scored_trials` when available, falls back to `trials.map(toUnscoredTrial)`

---

### ~~Feature 3 — Knowledge Graph Visualiser~~ ✅ COMPLETE

**What was built:**

- `graph.py get_subgraph(trial_ids)` — OPTIONAL MATCH Cypher, deduplicated node dict, typed link list
- `GET /api/v1/graph/subgraph?trial_ids=...` — FastAPI endpoint with `SubgraphResponse` model
- `fetchSubgraph()` in `lib/api.ts`
- `SubgraphNode/Link/Data` types in `types/index.ts`
- `GraphTab.tsx` — `ForceGraph2D` loaded in `useEffect` (no `next/dynamic`); custom canvas rendering (glow, labels, arrow links, colour by type); `queueMicrotask` for React 19 compliance; `ResizeObserver` responsive canvas; legend
- `Navbar.tsx` — 3rd "Graph" tab; `Tab` type exported
- `page.tsx` — `graphTrialIds` state, `handleVisualize` switches tab and passes IDs
- `MatchTab.tsx` — "Visualise Graph" button appears after successful match

---

### ~~Feature 4 — FHIR Patient Import~~ ✅ COMPLETE

**What was built:**

- `POST /api/v1/patients/match/fhir` in `routers/patients.py`
- `_parse_fhir_bundle()` — `Patient.birthDate` → age, `Patient.gender`, `Condition.code.text`, `MedicationStatement`/`MedicationRequest`; assembles natural-language query string
- `FhirBundle` Pydantic model; FHIR result cached under SHA256(patient_query)
- `matchFhirPatient()` in `lib/api.ts`
- `PatientInput.tsx` — "Free Text" / "FHIR JSON" pill toggle; JSON textarea with pre-filled FHIR R4 example bundle
- `MatchTab.tsx` — `mode === "fhir"` calls `matchFhirPatient()` (no SSE); shows parsed profile banner on result

---

### ~~Feature 5 — Trial Watchlist + Background Monitoring~~ ✅ COMPLETE

**What was built:**

- `src/watchlist.py` — `WatchlistManager`: `SavedProfile` nodes in Neo4j, `save_profile()`, `list_profiles()`, `delete_profile()`, `run_all(Callable[..., Any])`; diffs `current_ids` vs `last_trial_ids`; updates `last_trial_ids` after each run
- `watchlist_manager` singleton in `dependencies.py`
- `routers/watchlist.py` — `POST /watchlist`, `GET /watchlist`, `DELETE /watchlist/{id}`, `POST /watchlist/run`
- `seed.py __main__` — re-runs watchlist after seeding, logs new match count
- `Navbar.tsx` — 4th "Watchlist" tab
- `WatchlistTab.tsx` — profiles grid, "Run All" button, new-match count; React-19-compliant `useEffect` (direct `.then/.catch/.finally`, no `useCallback`)
- `WatchlistCard.tsx` — profile text, created date, total/new match counts, expand scored trials, delete
- `MatchTab.tsx` — "Save to Watchlist" button (violet → emerald on save), resets on new match
- `saveToWatchlist()`, `getWatchlist()`, `deleteFromWatchlist()`, `runWatchlist()` in `lib/api.ts`

---

### ~~Feature 6 — Reverse Matching ("Who fits this trial?")~~ ✅ COMPLETE

**What was built:**

- `graph.py get_trial_context(trial_id)` — fetches Trial node properties + all relationship targets grouped by type
- `POST /api/v1/trials/{trial_id}/eligible-profile` in `routers/trials.py`
- `reverse_chain` in `dependencies.py` — `ChatOllama(temperature=0.3)` + 2-3 sentence profile prompt
- `EligibleProfileResponse` model (`trial_id`, `trial_title`, `ideal_profile`)
- `fetchEligibleProfile(trialId)` in `lib/api.ts`
- `EligibleProfileResponse` type in `types/index.ts`
- `TrialCard.tsx` — "Who fits this trial?" button with `Users` icon; lazy-fetch on first click; result cached in component state; toggle visibility on subsequent clicks; violet-accented `AnimatePresence` inline panel

---

### ~~Feature 7 — Batch Patient Matching~~ ✅ COMPLETE

**What was built:**

- `POST /api/v1/patients/match/batch` in `routers/patients.py` — `multipart/form-data` CSV upload
- CSV parsing with `csv.DictReader`; case-insensitive `profile` column lookup; `utf-8-sig` decode (strips BOM)
- `_run_single_match(row, profile)` — runs full agent, extracts top scored trial; error-safe
- `ThreadPoolExecutor(max_workers=3)`, `BATCH_MAX_ROWS=50`, `BATCH_LLM_TIMEOUT=150`; results returned in original row order
- `BatchMatchResult` model (`row`, `profile`, `total_matches`, `top_trial_id/title/score`, `error`)
- `matchPatientsBatch(file)` in `lib/api.ts` — `FormData` POST, no manual `Content-Type`
- `BatchMatchResult` type in `types/index.ts`
- `BatchUpload.tsx` — drag-and-drop zone, CSV format hint, loading state with time warning, results table (row / profile / matches / top trial / score), client-side download CSV
- `MatchTab.tsx` — "Single Patient" / "Batch Upload" pill switcher; batch mode renders `<BatchUpload />` full-width

---

### ~~Feature 8 — Redis Caching Layer~~ ✅ COMPLETE

**What was built:**

- `redis==5.2.1` in `requirements.txt`; `redis:7-alpine` in `docker-compose.yml` with healthcheck; API `depends_on: redis: condition: service_healthy`
- `REDIS_URL=redis://localhost:6379` in `.env` and `docker-compose.yml` API environment
- `dependencies.py` — `redis_client` singleton: `from_url()` + `ping()` at startup; `None` on failure (graceful degradation, one warning log). Helper functions: `make_cache_key()` (SHA256), `cache_get()`, `cache_set()` (TTL=3600s), `cache_flush()` (flushdb) — all silent on Redis errors
- `routers/patients.py` — cache check/store in `match_patient` and `match_patient_fhir`; `X-Cache: HIT/MISS` + `Cache-Control` response headers; SSE stream and batch are intentionally uncached
- `routers/trials.py` — `cache_flush()` called after every successful ingestion

---

### ~~Feature 9 — ICD-10 / SNOMED Code Mapping~~ ✅ COMPLETE

**What was built:**

- `src/coding.py` — `map_to_icd10(condition_name)`: GET to NIH NLM Clinical Tables API, 5s timeout, returns `data[1][0]` (first code) or `None`; warnings-only on failure, never blocks ingestion
- `schema.py Condition` — `icd10_code: str | None = Field(default=None)` — populated post-extraction, not by LLM
- `graph.py _ensure_indexes` — `condition_icd10` index added
- `graph.py _create_graph_topology` — conditions UNWIND passes `{name, code}` dicts; `ON CREATE SET c.icd10_code` + `ON MATCH SET c.icd10_code = COALESCE(new, existing)`
- `seed.py _process_trial` + `routers/trials.py ingest_trial` — both call `map_to_icd10()` for all treated + excluded conditions after extraction, before ingestion
- `agent.py generate_cypher` — schema section documents `icd10_code` property; Rule 1: `c.icd10_code = "E11" OR toLower(c.name) CONTAINS "diabetes"` pattern; example updated
- `types/index.ts ExtractedEntities` — condition arrays: `{ name: string; icd10_code?: string | null }[]`
- `EntityCard.tsx` — `EntityItem` interface `{name, icd10_code?}`; ICD code shown as small mono badge inside chip with `title` tooltip; `badgeMap` matches card colour scheme
- `IngestionResult.tsx` — condition `EntityCard` calls pass `{name, icd10_code}` objects; medication cards pass `{name}` only

---

### ~~Feature 10 — Trial Phase + Status Filtering~~ ✅ COMPLETE

**What was built:**

- `graph.py _ensure_indexes` — added `trial_phase` and `trial_status` indexes
- `graph.py ingest_trial` — added `phase: str | None` and `status: str | None` params; passed to `_create_graph_topology`
- `graph.py _create_graph_topology` — Trial MERGE `ON CREATE/ON MATCH SET` now stores `t.phase` and `t.status`
- `seed.py TrialRecord` — added `phase` and `status` dataclass fields
- `seed.py _parse_study` — extracts `designModule.phases[0]` → `phase` (e.g. `"PHASE3"`) and `statusModule.overallStatus` → `status` (e.g. `"RECRUITING"`)
- `seed.py _process_trial` — passes `phase=record.phase, status=record.status` to `ingest_trial`
- `agent.py GraphState` — added `phase_filter: NotRequired[str]` and `status_filter: NotRequired[str]`
- `agent.py generate_cypher` — full rewrite: `prompt` is always defined (fixes latent bug where it was only defined inside the error-retry `if` block); GRAPH SCHEMA documents `phase`/`status`; builds ACTIVE FILTERS block injected into the system prompt when filters are set
- `routers/patients.py` — `match_patient` and `stream_match_patient` accept `?phase` and `?status` query params via `Query as QueryParam`; inject into `GraphState`; cache key updated to include filter values; renamed SSE inner variable to `status_val` to avoid shadowing the `status` param
- `lib/api.ts` — `MatchFilters` interface exported; `matchPatient()` and `streamMatchPatient()` accept optional `filters?: MatchFilters` and append as URL query params
- `match/PatientInput.tsx` — added `phase`/`status`/`onPhaseChange`/`onStatusChange` props; `PHASE_OPTIONS` (I/II/III/IV) and `STATUS_OPTIONS` (Recruiting/Active/Completed) constants; `FilterChip` toggle pill component; filter rows rendered below textarea in text mode only
- `match/MatchTab.tsx` — added `phase` and `status` state; passed to `PatientInput`; forwarded as `MatchFilters` to `streamMatchPatient`

---

### ~~Feature 11 — Drug Interaction Check (OpenFDA)~~ ✅ COMPLETE

**What was built:**

- `src/interactions.py` (new) — three-layer design:
  - `_get_interaction_text(med_name)` — single OpenFDA call (`/drug/label.json`), returns lowercased `drug_interactions` text or `""` on any failure
  - `get_interaction_texts(patient_meds)` — fetches texts for all patient meds; one OpenFDA call per med regardless of trial count
  - `warnings_for_trial(interaction_texts, trial_meds)` — pure in-memory check; returns human-readable warning strings for each conflicting pair
  - `check_interactions(patient_meds, trial_meds)` — convenience wrapper combining the above two
- `graph.py get_trial_medications(trial_ids)` — new method; single Cypher query returns `{trial_id: [med_names]}` for all matched trials at once
- `routers/patients.py _extract_patient_meds(analyzed_profile)` — regex parses `Medications: ...` line from LLM-analyzed profile
- `routers/patients.py _enrich_with_interactions(scored, analyzed_profile)` — calls `get_trial_medications` + `get_interaction_texts` once, then runs `warnings_for_trial` per trial; attaches `interaction_warnings: list[str]` to each scored trial dict; returns enriched list + deduplicated global warning list; never raises
- `match_patient` + `match_patient_fhir` — call `_enrich_with_interactions` after agent; include `interaction_warnings` in cached result
- `stream_match_patient` — calls `await asyncio.to_thread(_enrich_with_interactions, ...)` after `astream` completes to avoid blocking the event loop; includes warnings in the final SSE `result` event
- `models.py MatchResponse` — added `interaction_warnings: list[str] = Field(default_factory=list)`
- `types/index.ts ScoredTrial` — added `interaction_warnings?: string[]`
- `types/index.ts MatchResponse` — added `interaction_warnings: string[]`
- `match/TrialCard.tsx` — amber `AlertTriangle` warning box rendered below `ScoreBar` when `trial.interaction_warnings?.length > 0`; always visible (not behind expand toggle) since safety-critical

---

## Implementation Order

| # | Feature | Effort | Impact | Status |
| --- | --------- | -------- | -------- | -------- |
| 1 | Streaming Agent (SSE) | Medium | Very High | ✅ Done |
| 2 | Per-Trial Scoring | Medium | Very High | ✅ Done |
| 3 | Graph Visualiser | Medium | High (demo) | ✅ Done |
| 4 | FHIR Import | Low | High (credibility) | ✅ Done |
| 5 | Watchlist + Monitoring | High | High (product) | ✅ Done |
| 6 | Reverse Matching | Low | Medium | ✅ Done |
| 7 | Batch Matching | Medium | Medium | ✅ Done |
| 8 | Redis Caching | Low | Medium | ✅ Done |
| 9 | ICD-10 / SNOMED Mapping | Medium | High (accuracy) | ✅ Done |
| 10 | Phase/Status Filters | Low | Medium | ✅ Done |
| 11 | Drug Interaction Check | Medium | High (safety) | ✅ Done |

---

## Rules for This Project

- **Never modify files directly** without showing the user the code first. User makes the changes themselves.
- **Always check this file first** before starting any new feature — implementation notes are already written above.
- **Do not skip type annotations** — Pylance strict mode is in use. Use `state.get("key", default)` for `NotRequired` TypedDict fields. Use `default=None` (not positional `None`) in Pydantic `Field()`.
- **No new `print()` statements** — use `logging.getLogger(__name__)` in all Python files. Exception: `__main__` blocks for manual script testing only.
- **No per-request `GraphManager()` instances** — use the module-level singleton from `dependencies.py`.
- **Do not add `timeout` to `ChatOllama`** — the parameter does not exist. Timeouts are handled at `future.result(timeout=150)`.
- **Frontend API URL** always comes from `process.env.NEXT_PUBLIC_API_URL` via `lib/api.ts`. Never hardcode.
- **Tests must not require Ollama, Neo4j, or Redis** — mock everything external. Patch targets are now `src.routers.*`, not `src.api.*`.
- **`seed.py` default limit** is 10 in the function signature, 100 in `__main__`. Keep this distinction.
- **`test_extraction.py` no longer exists** — it was replaced by `test_schema.py`. Do not recreate it.
- **When adding a new planned feature**, update the Implementation Order table in this file to mark it complete, move the feature section header to struck-through (~~Feature N~~) with ✅ COMPLETE, and replace the bullet-point plan with a "What was built" summary.
- **SSE endpoint is POST, not GET** — do not change to GET or use EventSource on the frontend. EventSource cannot send request bodies.
- **`ForceGraph2D` lives inside `GraphTab.tsx`** — there is no `ForceGraphWrapper.tsx`. The library is imported inside `useEffect`, stored in state with `setForceGraph(() => mod.default)`. Do not move this to `next/dynamic`.
- **`Tab` type lives in `Navbar.tsx`** — import it from there everywhere. Do not redefine it in `page.tsx` or elsewhere.
- **Redis cache helpers never throw** — `cache_get`, `cache_set`, `cache_flush` all wrap Redis calls in `try/except` and log warnings. Business logic must never fail because of a Redis error.
- **ICD-10 lookup never blocks ingestion** — `map_to_icd10()` catches all exceptions and returns `None`. A coding failure is a warning, not an error.
- **All singletons go in `dependencies.py`** — never instantiate `GraphManager`, `WatchlistManager`, `ChatOllama` chains, or `redis.Redis` inside a router or endpoint function.
- **Drug interaction check never blocks the match pipeline** — `_enrich_with_interactions` wraps all external calls in `try/except`; failures are logged as warnings and the original scored list is returned unchanged. In the SSE endpoint it runs via `asyncio.to_thread` to avoid blocking the async event loop.
- **OpenFDA is called once per patient medication, not per trial** — `get_interaction_texts` fetches all interaction texts upfront; `warnings_for_trial` does pure in-memory checks per trial. This keeps OpenFDA calls to `n_patient_meds` total regardless of how many trials matched.
- **Interaction warnings are per-trial** — each `ScoredTrial` dict gets its own `interaction_warnings: list[str]` specific to that trial's medications. `MatchResponse.interaction_warnings` holds the deduplicated union across all trials. `TrialCard` shows only the per-trial list.
- **Phase/status filter cache keys include the filter values** — `make_cache_key(f"{profile}|phase={phase or ''}|status={status or ''}")`. A query with Phase III filters must not return a cached result from an unfiltered query.
- **`generate_cypher` always defines `prompt` at function scope** — the previous pattern defined `prompt` only inside `if error_message:`, causing a `NameError` on first invocation. The rewrite builds `prompt` unconditionally, incorporating `error_context` and `active_filters` as f-string interpolations.
- **`status` variable shadowing in `stream_match_patient`** — the outer FastAPI `status` parameter must not be shadowed inside the `event_stream` closure. The SSE node status string is assigned to `status_val` instead.
