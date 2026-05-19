# CLAUDE.md — Healthcare Clinical Trial Matching System

This file is the single source of truth for project context. Read it at the start of every session before making any changes.

---

## What This Project Is

An AI-powered clinical trial matching system. Given a patient profile in natural language ("55yo male with Type 2 Diabetes"), it searches a Neo4j knowledge graph of clinical trials and returns matching trials with reasoning.

**Key differentiator:** The graph is built by extracting structured entities from raw clinical trial text using a local LLM (Llama 3 via Ollama), not manual curation. The matching itself uses a LangGraph agent that generates and executes Cypher queries dynamically, streams real-time progress via SSE, scores every matched trial 0–100 with reasons and concerns, exposes the graph visually in a force-directed canvas, supports FHIR R4 bundle import, watchlist monitoring, batch CSV matching, Redis caching, ICD-10 code mapping, and phase/status filtering.

---

## Tech Stack

| Layer            | Technology                                                                               |
|------------------|------------------------------------------------------------------------------------------|
| LLM              | Ollama + Llama3 (local, default); OpenAI / Anthropic via `get_llm()` factory (Feature P) |
| Orchestration    | LangGraph                                                                                |
| Knowledge Graph  | Neo4j 5 Community                                                                        |
| Data Extraction  | LangChain with Pydantic structured output                                                |
| Caching          | Redis 7 (optional — graceful degradation if unavailable)                                 |
| ICD-10 Mapping   | NIH NLM Clinical Tables API (free, no key)                                               |
| Backend API      | FastAPI + Uvicorn                                                                        |
| Frontend         | Next.js 16 + TypeScript + Tailwind CSS v4                                                |
| UI Animations    | Framer Motion                                                                            |
| Icons            | Lucide React                                                                             |
| Graph Visualiser | react-force-graph-2d (canvas, SSR-disabled)                                              |
| Containerisation | Docker + Docker Compose                                                                  |
| Testing          | Pytest (mocked — no external deps needed)                                                |

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
│                                       SEED_ON_STARTUP (default false),
│                                       LLM_PROVIDER (default "ollama"), LLM_MODEL (default "llama3"),
│                                       OPENAI_API_KEY (optional), ANTHROPIC_API_KEY (optional)
│
├── src/
│   ├── schema.py                    ← Pydantic domain models: Condition (+ icd10_code), Medication,
│   │                                   TrialEligibility, ExtractedEntities, ScoredTrial
│   ├── extract.py                   ← Llama3 extraction chain; assess_extraction_confidence()
│   │                                   returns 0.0–1.0; CONFIDENCE_THRESHOLD = 0.6
│   ├── graph.py                     ← Neo4j GraphManager (singleton driver, indexes, batched writes,
│   │                                   get_subgraph, get_trial_context, get_similar_trials,
│   │                                   save_match_history, list_match_history,
│   │                                   search_medications, get_medication_detail,
│   │                                   get_graph_quality, fix_missing_icd10,
│   │                                   ingest_pending_review, list_pending_reviews,
│   │                                   approve_pending_review, reject_pending_review,
│   │                                   create/get/list/update/delete_patient_profile)
│   ├── agent.py                     ← LangGraph 5-node workflow (analyze→cypher→execute→score→evaluate)
│   │                                   GraphState includes phase_filter + status_filter +
│   │                                   llm_provider + llm_model (Feature P); all 4 LLM nodes call
│   │                                   get_llm(state.get("llm_provider"), state.get("llm_model"));
│   │                                   generate_cypher injects active filters; ICD-first matching rule
│   ├── coding.py                    ← map_to_icd10() via NIH NLM Clinical Tables API
│   ├── interactions.py              ← check_interactions(), get_interaction_texts(),
│   │                                   warnings_for_trial() via OpenFDA drug label API;
│   │                                   _get_adverse_reactions(), get_adverse_reaction_texts(),
│   │                                   side_effects_for_trial() for Feature J
│   ├── watchlist.py                 ← WatchlistManager: SavedProfile CRUD + run_all() + update_notes()
│   ├── models.py                    ← API Pydantic request/response models (all in one place);
│   │                                   SimilarTrial, MatchHistoryItem, UpdateNotesRequest,
│   │                                   QualityIssue, GraphQualityResponse,
│   │                                   PendingReviewItem,
│   │                                   PatientProfileCreate, PatientProfileUpdate,
│   │                                   PatientProfileResponse
│   ├── dependencies.py              ← Module-level singletons: graph_manager, watchlist_manager,
│   │                                   redis_client, reverse_chain, eligibility_chain; cache helpers;
│   │                                   Feature P: get_llm(provider, model) factory + _llm_cache dict;
│   │                                   _create_llm() for ollama/openai/anthropic (lazy imports)
│   ├── scheduler.py                 ← APScheduler BackgroundScheduler; start_scheduler(),
│   │                                   stop_scheduler(), trigger_seed_now(), get_next_run_time()
│   │                                   Reads SEED_INTERVAL_HOURS, SEED_LIMIT, SEED_ON_STARTUP
│   ├── seed.py                      ← ClinicalTrials.gov fetcher + concurrent ingestion + ICD enrichment
│   │                                   TrialRecord carries phase + status; _parse_study extracts both;
│   │                                   _process_trial checks confidence → routes to PendingReview if < 0.6
│   ├── logging_config.py            ← Centralised logging (stdout + rotating file)
│   └── routers/
│       ├── __init__.py
│       ├── patients.py              ← /patients/match, /match/fhir, /match/stream, /match/batch
│       │                               FHIR parser, batch helper, Redis cache logic
│       │                               ?phase + ?status + ?provider + ?model query params on
│       │                               /match + /match/stream; provider/model injected into
│       │                               GraphState.llm_provider / llm_model (Feature P)
│       │                               GET /history; _save_history(); _extract_patient_conditions()
│       │                               side_effect_flags enrichment in _enrich_with_interactions()
│       ├── graph.py                 ← /graph/subgraph, /graph/stats, /graph/conditions,
│       │                               GET /graph/quality, POST /graph/quality/fix-icd10
│       ├── trials.py                ← /trials/ingest (+ confidence check → pending review if < 0.6),
│       │                               /trials/{id}/eligible-profile, /trials/{id}/similar,
│       │                               /trials/search, /trials/{id} (detail),
│       │                               /trials/{id}/eligibility,
│       │                               GET /trials/review, POST /trials/review/{id}/approve,
│       │                               POST /trials/review/{id}/reject
│       ├── medications.py           ← GET /medications/search, GET /medications/{name}
│       ├── patient_profiles.py      ← POST/GET /patient-profiles, GET/PATCH/DELETE /patient-profiles/{id}
│       └── watchlist.py             ← /watchlist CRUD + /watchlist/run + PATCH /watchlist/{id}/notes
│
├── tests/
│   ├── conftest.py                  ← sys.modules stubs for all heavy deps; redis mock (get→None);
│   │                                   multipart check bypass for FastAPI 0.136.1
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
        ├── types/index.ts           ← TrialResult, ScoredTrial (+ interaction_warnings, side_effect_flags),
        │                               MatchResponse, ExtractedEntities (Condition with icd10_code),
        │                               IngestionResponse, SubgraphNode/Link/Data, NodeStatus,
        │                               ProgressEvent, ResultEvent, ErrorEvent, StreamEvent,
        │                               WatchlistProfile (+ notes, notes_updated_at), WatchlistRunResult,
        │                               EligibleProfileResponse, BatchMatchResult,
        │                               SimilarTrial, MatchHistoryItem, GraphStats, ConditionStat,
        │                               TrialDetail, TrialSearchResponse,
        │                               QualityIssue, GraphQuality, PendingReviewItem,
        │                               PatientProfile
        ├── lib/utils.ts             ← Shared timeAgo(isoString) utility
        ├── lib/api.ts               ← MatchFilters interface (phase, status, provider, model — Feature P);
        │                               matchPatient(), matchFhirPatient(),
        │                               streamMatchPatient() (all accept optional MatchFilters);
        │                               provider + model forwarded as ?provider=&model= query params;
        │                               ingestTrial(), fetchSubgraph(), fetchEligibleProfile(),
        │                               matchPatientsBatch(), getWatchlist(), saveToWatchlist(),
        │                               deleteFromWatchlist(), runWatchlist(), updateWatchlistNotes(),
        │                               triggerSeed(), getSeedStatus(), fetchSimilarTrials(),
        │                               fetchMatchHistory(), searchTrials(), fetchTrialDetail(),
        │                               fetchGraphStats(), fetchConditions(),
        │                               fetchGraphQuality(), fixMissingIcd10(),
        │                               fetchPendingReviews(), approvePendingReview(), rejectPendingReview(),
        │                               listPatientProfiles(), createPatientProfile(),
        │                               updatePatientProfile(), deletePatientProfile()
        └── components/
            ├── ThemeProvider.tsx
            ├── ThemeToggle.tsx
            ├── settings/
            │   └── SettingsPanel.tsx ← Feature P: slide-over LLM settings; provider selector
            │                            (Ollama/OpenAI/Anthropic); model dropdown per provider;
            │                            amber API-key warning for cloud providers; localStorage
            │                            persistence via STORAGE_KEY; exports LlmSettings interface,
            │                            loadLlmSettings() helper
            ├── layout/
            │   └── Navbar.tsx       ← Glass nav, tab pills, theme toggle; exports Tab type;
            │                           Feature P: onSettingsClick? + llmLabel? props; gear icon
            │                           button shows active LLM label (Settings2 icon)
            ├── ui/
            │   ├── EmptyState.tsx
            │   ├── ErrorBanner.tsx
            │   └── Skeleton.tsx     ← Shimmer loader
            ├── match/
            │   ├── MatchTab.tsx     ← Single/Batch pill switcher; SSE streaming; onVisualize;
            │   │                       4-button 2×2 action row: Visualise Graph / Save to Watchlist /
            │   │                       Download Report / Export FHIR; phase + status state → filters;
            │   │                       historyKey + handleRerun (re-run from history);
            │   │                       SimilarTrialsPanel + MatchHistory rendered in results area;
            │   │                       Feature P: llmProvider + llmModel props forwarded to filters
            │   ├── PatientInput.tsx ← Free Text / FHIR JSON mode toggle + textarea;
            │   │                       Phase I/II/III/IV + Recruiting/Active/Completed filter chips
            │   │                       (text mode only); FilterChip internal component
            │   ├── VerdictCard.tsx  ← Agent verdict with indigo left border accent
            │   ├── TrialCard.tsx    ← Score bar; reasons/concerns; "Who fits?" lazy-fetch panel;
            │   │                       amber interaction warning (always visible);
            │   │                       rose side effect risks (collapsible)
            │   ├── SimilarTrialsPanel.tsx ← Collapsible panel; fetches /trials/{id}/similar;
            │   │                             condition/medication chips; "View" opens TrialDetailDrawer
            │   ├── MatchHistory.tsx ← Collapsible recent searches list; Re-run button;
            │   │                       relative timestamps via timeAgo(); refreshKey prop
            │   ├── ExportFhirButton.tsx ← Teal button; builds FHIR R4 Bundle client-side from
            │   │                           MatchResponse; Patient + Observation (verdict) +
            │   │                           ResearchStudy + RiskAssessment per trial; downloads
            │   │                           trial-match-FHIR-YYYY-MM-DD.json
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
            │   └── WatchlistCard.tsx ← Profile text, date, match count, amber new-match badge, delete;
            │                            notes textarea (auto-save on blur, 500 char limit, timeAgo timestamp)
            ├── ingest/
            │   ├── IngestTab.tsx    ← Auto-seed panel + QualityPanel + ReviewQueue + manual ingest grid
            │   ├── IngestForm.tsx   ← Trial ID input + textarea + gradient submit
            │   ├── EntityCard.tsx   ← Coloured entity chips with optional ICD-10 code badge
            │   ├── IngestionResult.tsx ← Success/pending_review banner + trial summary + entity grid
            │   ├── QualityPanel.tsx ← Feature N: collapsible health dashboard; ScoreBadge; IssueRow
            │   │                       with expandable item list + "Fix" button for missing ICD-10;
            │   │                       health score 0–100 (emerald/amber/rose); Refresh button
            │   └── ReviewQueue.tsx  ← Feature O: collapsible amber panel; ReviewCard per item;
            │                           confidence badge; expandable extracted conditions/medications;
            │                           Approve (green) / Reject (red) per card; auto-loads on mount
            └── patients/
                ├── PatientTab.tsx   ← Feature M: profiles grid; "New Patient" button; empty state;
                │                       skeleton loading; delegates to PatientCard + PatientForm
                ├── PatientCard.tsx  ← Name + age/gender + condition chips (indigo) + medication chips
                │                       (emerald) + notes; confirm-delete flow; "Match Trials" button
                │                       calls assembleProfile() → onMatchTrials callback
                └── PatientForm.tsx  ← Slide-over modal; TagInput for conditions/medications
                                        (Enter/comma to add, Backspace to remove); name/age/gender/notes;
                                        create + edit modes; violet submit button
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
extract.py — assess_extraction_confidence(text, entities) → float 0.0–1.0
         ↓ (confidence ≥ 0.6)                    ↓ (confidence < 0.6)
schema.py — Pydantic validation              graph.py — ingest_pending_review()
         ↓                                         → (:PendingReview) node awaiting
graph.py — Neo4j MERGE + UNWIND batched writes     human approval in Ingest tab
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
  5. evaluate_results → LLM synthesizes scored results into human-readable verdict

  All 4 LLM nodes call get_llm(state.get("llm_provider"), state.get("llm_model"))
  LLM instances are cached by (provider, model) key in _llm_cache dict
         ↓
MatchResponse { patient_profile, executed_cypher, agent_verdict, trials[], scored_trials[] }
[Result stored in Redis — cache key includes phase + status + provider + model filters]
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

(SavedProfile {id, profile_text, created_at, last_trial_ids, notes, notes_updated_at})  ← watchlist

(MatchHistory {id, profile, top_trial_id, top_trial_title, top_score, total_matches, created_at})

(PendingReview {id, trial_id, trial_title, text, extracted_json, confidence, created_at})  ← Feature O

(PatientProfile {id, name, age, gender, conditions[], medications[], notes, created_at, updated_at})  ← Feature M

Indexes: trial_id, trial_phase, trial_status, condition_name, medication_name,
         condition_icd10, saved_profile_id, match_history_id, match_history_created_at,
         pending_review_id, patient_profile_id
```

---

## Key Design Decisions (Do Not Change Without Reason)

- **Names are lowercased in schema.py** (`field_validator` on `Condition.name` and `Medication.name`). The `toLower()` in Cypher is kept as a safety net but normalization happens at source.
- **`GraphManager` is a singleton** (`_driver` class variable, `threading.Lock` guarded). Do not create per-request instances — the driver teardown is expensive.
- **All module-level singletons live in `dependencies.py`** — `graph_manager`, `watchlist_manager`, `redis_client`, `reverse_chain`. `api.py` imports from there; routers import from there. Never instantiate these inside a request handler.
- **`api.py` is a thin app factory** — after the router split, it only contains: app creation, CORS, lifespan, health endpoint, `include_router` calls. All business logic is in `src/routers/`.
- **Test patch targets are `src.routers.*`** — after the refactor, mock at `src.routers.patients.agent_app.invoke`, `src.routers.trials.extract_trial_data`, `src.routers.trials.graph_manager.ingest_trial`, etc. — not `src.api.*`.
- **`_get_driver()` in `agent.py` has no `threading.Lock`** — unlike `GraphManager`. This is safe currently because FastAPI endpoints are synchronous (one thread per request, GIL protected). If the agent is ever made async, add a lock before calling `_get_driver()`.
- **LangGraph nodes return `dict` not `GraphState`** — partial state updates. pylance requires `state.get("key", default)` for `NotRequired` fields.
- **`ingest_trial()` skips duplicates by default** (`overwrite=False`). Pass `overwrite=True` to force re-ingestion.
- **`seed.py` uses structured text** (labelled sections with conditions, interventions, eligibility from the ClinicalTrials.gov API) rather than raw prose. This significantly improves Llama3 extraction accuracy.
- **Ollama timeout** is enforced at `future.result(timeout=150)` in `seed.py` and `BATCH_LLM_TIMEOUT=150` in `routers/patients.py`. `ChatOllama` has no `timeout` parameter — do not attempt to add one.
- **CORS** in `api.py` allows `GET`/`POST`/`DELETE`/`PATCH` and `Content-Type`/`Authorization` headers from `http://localhost:3000`. `PATCH` was added for the patient profile update endpoint.
- **Frontend API URL** is read from `NEXT_PUBLIC_API_URL` env var (`.env.local`). Never hardcode `localhost:8000`.
- **`__main__` blocks** in `agent.py` and `extract.py` use `print()` and `logging.basicConfig` directly — this is intentional for quick manual script testing only. Do not replicate this pattern elsewhere.
- **SSE uses POST + fetch ReadableStream, not EventSource** — `EventSource` is GET-only and cannot send a JSON body. The streaming endpoint is `POST /api/v1/patients/match/stream`.
- **`score_matches` JSON parsing has two fallbacks** — first tries `json.loads(raw)`, then `re.search(r"\[.*\]", raw, re.DOTALL)`, then falls back to score=50 with `"Matched by graph query"`. Never crash on bad LLM output.
- **`ForceGraph2D` is loaded inside `useEffect` in `GraphTab.tsx`** — NOT via `next/dynamic`. `setForceGraph(() => mod.default)` — the arrow wrapper is critical; without it React treats the component as a state updater function. There is no `ForceGraphWrapper.tsx` file; it was eliminated.
- **`Tab` type is exported from `Navbar.tsx`** — import it from there everywhere. Do not redefine it in `page.tsx` or elsewhere.
- **Redis is optional in local dev** — `dependencies.py` calls `redis_client.ping()` at startup and sets `redis_client = None` on failure. Every cache helper (`cache_get`, `cache_set`, `cache_flush`) guards with `if redis_client is None: return`. The app runs correctly without Redis.
- **ICD-10 enrichment is post-extraction, not LLM-generated** — `Condition.icd10_code` is `None` after LLM extraction; `map_to_icd10()` is called separately and sets it before ingestion. The LLM is not asked to produce ICD codes — it might hallucinate them.
- **Batch endpoint does not accept `Content-Type: multipart/form-data` manually** — the browser sets it automatically with the boundary when using `FormData`. Do not set `Content-Type` in the `fetch()` call for the batch endpoint.
- **`run_all` in `watchlist.py` accepts `Callable[..., Any]`** — LangGraph's `invoke` is heavily overloaded; pylance cannot narrow it to `Callable[[dict], dict]`. Use `Callable[..., Any]` to avoid type errors.
- **React 19 synchronous setState rule** — all `setState` calls in `useEffect` bodies must be inside async callbacks (`.then`, `.catch`, `.finally`, `queueMicrotask`, observer callbacks). Never call `setState` directly in the effect body.
- **`jsPDF` is imported lazily inside the click handler** — `await import("jspdf")` runs only when the user clicks "Download Report". This keeps it out of the initial bundle and avoids any SSR issues (jsPDF uses browser APIs). Do not move this import to the module top-level.
- **`buildReport()` tracks `currentY` manually** — jsPDF has no automatic page-break or flow layout. Every text block calls `checkBreak(needed)` before rendering to insert a new page when less than `needed` mm remain. Never write to fixed Y coordinates; always use the `y` variable.
- **Score bar color is determined by score threshold** — `≥70` → emerald (16,185,129), `≥40` → amber (245,158,11), `<40` → rose (239,68,68). Same thresholds as `TrialCard.tsx`. Keep in sync if thresholds ever change.
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

## What Has Been Built

### Backend

| File                          | What was built / improved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
|-------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `schema.py`                   | `field_validator` (name normalisation, empty check), `model_validator` (age range), gender normalisation, `ge=0` constraint; `ScoredTrial` model; `Condition.icd10_code` field (optional, post-extraction); **Feature J:** `side_effect_flags: List[str] = Field(default_factory=list)` on `ScoredTrial`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `graph.py`                    | Neo4j indexes on startup (`IF NOT EXISTS`) incl. `condition_icd10`, `trial_phase`, `trial_status`, `match_history_id`, `match_history_created_at`; `UNWIND` batched writes; singleton driver with `threading.Lock`; `trial_exists()` deduplication; `get_subgraph(trial_ids)`; `get_trial_context(trial_id)` for reverse matching; `get_trial_medications(trial_ids)` for interaction check; `get_similar_trials(trial_id, exclude_ids, limit)` — graph traversal via `[:TREATS\|USES_MEDICATION]`, ranked by overlap; `save_match_history(...)` — CREATE `(:MatchHistory)` node; `list_match_history(limit)` — ordered by `created_at DESC`                                                                                                                                                                                       |
| `interactions.py`             | `_get_interaction_text()` (OpenFDA, 5s timeout, silent on failure); `get_interaction_texts()` (batch, one call per patient med); `warnings_for_trial()` (pure in-memory); `check_interactions()` (convenience wrapper); **Feature J additions:** `_get_adverse_reactions(med_name)` — OpenFDA `adverse_reactions` field; `get_adverse_reaction_texts(trial_meds)` — batch fetch for trial meds; `side_effects_for_trial(adverse_texts, trial_meds, patient_conditions)` — keyword cross-reference, returns human-readable flags                                                                                                                                                                                                                                                                                                    |
| `agent.py`                    | 5-node LangGraph workflow; `score_matches` JSON fallbacks; `evaluate_results` scored context; retry edge (max 2); `GraphState` has `phase_filter`/`status_filter`; `generate_cypher` always defines `prompt` (bug fix), injects ACTIVE FILTERS block when filters set, documents `phase`/`status` in GRAPH SCHEMA; **Feature P:** `llm_provider`/`llm_model` added to `GraphState`; removed module-level `llm = ChatOllama(...)`; all 4 nodes now call `get_llm(state.get("llm_provider"), state.get("llm_model"))`                                                                                                                                                                                                                                                                                                                |
| `extract.py`                  | `isinstance` return type validation, `logging` replacing `print`, removed invalid `timeout` parameter; **Feature O:** `CONFIDENCE_THRESHOLD = 0.6` module constant; `assess_extraction_confidence(text, entities)` — second LLM call via `llm.invoke()`, regex-extracts first float from response, clamps 0.0–1.0, returns 1.0 on any failure so ingestion is never blocked; **Feature P:** `llm = ChatOllama(model=os.getenv("LLM_MODEL", "llama3"), ...)` reads model from env                                                                                                                                                                                                                                                                                                                                                   |
| `coding.py`                   | New — `map_to_icd10()` via NIH NLM Clinical Tables API; 5s timeout; silent on failure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `watchlist.py`                | `WatchlistManager`: `SavedProfile` CRUD in Neo4j, `run_all(Callable[..., Any])` with diff against `last_trial_ids`; **Feature I:** `update_notes(profile_id, notes)` — `SET p.notes = $notes, p.notes_updated_at = $updated_at`; `list_profiles()` now returns `notes` + `notes_updated_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `models.py`                   | All API Pydantic request/response models; **additions:** `SimilarTrial` (trial_id, title, shared_conditions, shared_medications, overlap_count); `MatchHistoryItem` (id, profile, top_trial_id, top_trial_title, top_score, total_matches, created_at); `UpdateNotesRequest` (notes: str); `WatchlistProfileResponse` updated with `notes: str                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | None` + `notes_updated_at: str | None` |
| `dependencies.py`             | `graph_manager`, `watchlist_manager`, `redis_client` (graceful degradation), `reverse_chain`, `eligibility_chain`, `make_cache_key()`, `cache_get/set/flush()` helpers; **Feature P:** `_llm_cache: dict[tuple[str,str], BaseChatModel]`; `_create_llm(provider, model)` — lazy-imports `ChatOpenAI`/`ChatAnthropic` (optional deps); `get_llm(provider?, model?)` — reads `LLM_PROVIDER`/`LLM_MODEL` env vars, caches instances by `(provider, model)` key                                                                                                                                                                                                                                                                                                                                                                        |
| `scheduler.py`                | New — `BackgroundScheduler` (APScheduler); `start_scheduler()` / `stop_scheduler()` called from lifespan; `trigger_seed_now()` (daemon thread); `get_next_run_time()` (ISO-8601 or None); reads `SEED_INTERVAL_HOURS`, `SEED_LIMIT`, `SEED_ON_STARTUP` from env                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `api.py`                      | Added scheduler start/stop to lifespan; `POST /api/v1/admin/seed` trigger endpoint; `GET /api/v1/admin/seed/status` next-run endpoint; **Feature M:** registered `patient_profiles_router`; **Feature N+O:** `PATCH` added to CORS `allow_methods`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `routers/patients.py`         | `/patients/match` (+ Redis cache + `?phase`/`?status` filters + interaction enrichment), `/match/fhir` (+ FHIR parser + cache + interaction enrichment), `/match/stream` (SSE + `asyncio.to_thread` interaction enrichment), `/match/batch`; `_extract_patient_meds()` parses LLM profile; `_enrich_with_interactions()` never raises; cache key includes filter values; **Feature G:** `_save_history()` (never raises) called after every successful match; `GET /history` endpoint; **Feature J:** `_extract_patient_conditions()` regex parser; `side_effect_flags` enrichment per trial inside `_enrich_with_interactions()`; **Feature P:** `?provider` + `?model` query params added to `/match` and `/match/stream`; injected into `GraphState.llm_provider` / `llm_model`; cache key extended to include provider + model |
| `routers/graph.py`            | `/graph/subgraph`; **Features C+E:** `/graph/stats`, `/graph/conditions`; **Feature N:** `GET /graph/quality` (5-query health report, health score 0–100); `POST /graph/quality/fix-icd10` (bulk ICD-10 enrichment via NIH NLM API, returns `{fixed: int}`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `routers/trials.py`           | `/trials/ingest` (+ ICD enrichment + **Feature O:** confidence check, routes to `(:PendingReview)` if < 0.6, status = "pending_review" in response); `/trials/{id}/eligible-profile` (reverse match LLM); **Features A+B+F:** `/trials/search`, `/trials/{id}` (detail), `/trials/{id}/similar`; **Feature L:** `/trials/{id}/eligibility`; **Feature O:** `GET /trials/review` (must be declared before `GET /trials/{trial_id}`), `POST /trials/review/{id}/approve`, `POST /trials/review/{id}/reject`                                                                                                                                                                                                                                                                                                                          |
| `routers/patient_profiles.py` | **Feature M:** new router; `POST /patient-profiles` (201); `GET /patient-profiles`; `GET /patient-profiles/{id}`; `PATCH /patient-profiles/{id}` (model_dump(exclude_none=True)); `DELETE /patient-profiles/{id}` (204); all backed by 5 GraphManager methods                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `routers/watchlist.py`        | `/watchlist` CRUD + `/watchlist/run`; **Feature I:** `PATCH /watchlist/{id}/notes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `seed.py`                     | `TrialSource` Protocol; `ClinicalTrialsGovSource`; `ThreadPoolExecutor`; ICD-10 enrichment in `_process_trial`; watchlist re-run after seeding; `TrialRecord` carries `phase`/`status`; `_parse_study` extracts from `designModule.phases[0]` + `statusModule.overallStatus`; passed to `ingest_trial`; **Feature O:** `_process_trial` now calls `assess_extraction_confidence` after ICD enrichment; routes to `ingest_pending_review` if below threshold (result message = `"queued_for_review(confidence=X.XX)"`)                                                                                                                                                                                                                                                                                                              |
| `logging_config.py`           | Centralised `setup_logging()` with `StreamHandler` + `RotatingFileHandler` (5MB, 3 backups)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `docker-compose.yml`          | Neo4j healthcheck; `redis:7-alpine` service with healthcheck; API `depends_on` both; `REDIS_URL` env var                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `requirements.txt`            | Added `redis==5.2.1`, `python-multipart==0.0.20`, `apscheduler==3.10.4`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Tests

| File             | Coverage                                                                                                                                                                                                |
|------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `conftest.py`    | Stubs neo4j, redis, langchain, apscheduler in `sys.modules`; configures redis mock `get → None`; bypasses FastAPI multipart check                                                                       |
| `test_schema.py` | Condition/Medication normalisation, age range validation, gender normalisation, empty field errors, full entity construction                                                                            |
| `test_api.py`    | `/health`, `/api/v1/patients/match` (success, missing field, agent failure), `/api/v1/trials/ingest` (success, missing text, extraction failure) — all mocked. Patch targets updated to `src.routers.*` |
| `test_agent.py`  | `should_retry` routing logic (all branches), `analyze_query` return shape, `execute_query` error handling + retry count increment                                                                       |
| `test_seed.py`   | `_parse_study` (valid, no-text skip, drug-type filtering, phase/status extraction), `fetch` HTTP call, `_process_trial` (success, extraction failure)                                                   |

### Frontend Components

| Component                        | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|----------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `types/index.ts`                 | Full type inventory including `WatchlistProfile` (+ `notes`, `notes_updated_at`), `WatchlistRunResult`, `EligibleProfileResponse`, `BatchMatchResult`; `ExtractedEntities` conditions carry `icd10_code`; `ScoredTrial` carries `interaction_warnings` + `side_effect_flags`; **additions:** `SimilarTrial`, `MatchHistoryItem`, `GraphStats`, `ConditionStat`, `TrialDetail`, `TrialSearchResponse`, `PatientProfile`, `QualityIssue`, `GraphQuality`, `PendingReviewItem`                                                                                                                                                                                                                                    |
| `lib/utils.ts`                   | Shared `export function timeAgo(isoString: string): string` — relative timestamps used by `MatchHistory.tsx` and `WatchlistCard.tsx`; avoids duplication                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `lib/api.ts`                     | `MatchFilters` interface (phase, status, **Feature P:** provider, model); `matchPatient()`, `streamMatchPatient()` forward provider/model as query params; **all Feature M/N/O additions:** `listPatientProfiles()`, `createPatientProfile()`, `updatePatientProfile()`, `deletePatientProfile()`, `fetchGraphQuality()`, `fixMissingIcd10()`, `fetchPendingReviews()`, `approvePendingReview()`, `rejectPendingReview()`; plus `fetchSimilarTrials(trialId, excludeIds)`, `fetchMatchHistory(limit)`, `updateWatchlistNotes(id, notes)`, `searchTrials(filters)`, `fetchTrialDetail(trialId)`, `fetchGraphStats()`, `fetchConditions(status?, limit?)`, `searchMedications(q)`, `fetchMedicationDetail(name)` |
| `globals.css`                    | Tailwind v4, `.bg-dot-grid` pattern, `.shimmer` keyframe animation, dark mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `layout/Navbar.tsx`              | Glass navbar, tab pills, theme toggle; exports `Tab` type; **Feature M:** "Patients" tab + `UserCircle` icon; **Feature P:** `onSettingsClick?`/`llmLabel?` props; gear icon (`Settings2`) shows active provider/model label; brand subtitle updates to show active LLM                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `app/page.tsx`                   | Root: `tab` state, `graphTrialIds` state, `handleVisualize`; **Feature M:** `matchInitialProfile`, `matchKey`, `handleMatchFromPatient`; `PatientTab` render; **Feature P:** `settingsOpen`, `llmSettings` state (loaded from localStorage via `loadLlmSettings()`); `SettingsPanel` render; `llmProvider`/`llmModel` passed to `MatchTab`                                                                                                                                                                                                                                                                                                                                                                     |
| `ui/Skeleton.tsx`                | Shimmer skeleton blocks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ui/EmptyState.tsx`              | Reusable placeholder with icon + messages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ui/ErrorBanner.tsx`             | Animated error display                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `match/MatchTab.tsx`             | Single/Batch pill switcher; SSE streaming; FHIR mode; 4-button 2×2 action row (Visualise Graph / Save to Watchlist / Download Report / Export FHIR); `phase`/`status` state passed to `PatientInput` and forwarded as `MatchFilters` to `streamMatchPatient`; **Feature F:** renders `<SimilarTrialsPanel>`; **Feature G:** `historyKey` + `handleRerun` (profileOverride pattern); renders `<MatchHistory>`; **Feature P:** `llmProvider?`/`llmModel?` props passed in from `page.tsx`, added to filters object forwarded to `streamMatchPatient`                                                                                                                                                             |
| `match/ExportFhirButton.tsx`     | **Feature K:** teal button; `uuidv4()` inline helper (no external dep); builds FHIR R4 `Bundle` with `Patient`, `Observation` (verdict, LOINC 75326-9), `ResearchStudy` + `RiskAssessment` per trial (score as `probabilityDecimal`, reasons as `rationale`, concerns as `note`, interaction warnings as FHIR `extension`); downloads `trial-match-FHIR-YYYY-MM-DD.json` with `application/fhir+json` MIME type; exported/exporting states with flash feedback                                                                                                                                                                                                                                                 |
| `match/DownloadReportButton.tsx` | Sky-coloured button; lazy-loads `jsPDF` on first click (`await import("jspdf")`); calls `buildReport()` which builds a full A4 PDF: indigo header block with trial count badge, Patient Profile section, Clinical Assessment, per-trial score bars + reasons/concerns/interaction warnings, global drug interaction summary, Cypher trace (capped at 8 lines), footer with page numbers; saves as `trial-match-YYYY-MM-DD.pdf`                                                                                                                                                                                                                                                                                 |
| `match/PatientInput.tsx`         | Free Text / FHIR JSON mode toggle; respective textareas; Phase I/II/III/IV + Recruiting/Active/Completed `FilterChip` rows (text mode only); `PHASE_OPTIONS`/`STATUS_OPTIONS` constants; `FilterChip` internal component                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `match/VerdictCard.tsx`          | Verdict with indigo left border accent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `match/TrialCard.tsx`            | Score bar (emerald/amber/rose); reasons/concerns expand; "Who fits?" lazy-fetch violet panel; amber `AlertTriangle` interaction warning box (always visible, not behind expand); **Feature J:** rose collapsible side effect risks panel (`sideEffectsExpanded` state, `hasSideEffectFlags` computed); structural fix: side effects toggle button sits outside `p-5` div at same level as other section toggles                                                                                                                                                                                                                                                                                                |
| `match/SimilarTrialsPanel.tsx`   | **Feature F:** collapsible panel; lazy-fetches `/trials/{id}/similar` on mount via `queueMicrotask`; count badge; condition chips (rose) + medication chips (sky); "View" button per result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `match/MatchHistory.tsx`         | **Feature G:** collapsible recent searches; `refreshKey` prop triggers re-fetch; `onRerun(profile)` callback; relative timestamps via `timeAgo()`; top trial + score summary per entry; Re-run button                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `match/CypherTrace.tsx`          | Collapsible Cypher debug panel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `match/StreamingProgress.tsx`    | Timeline: completed nodes (✓/✗) + active Loader2 spinner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `match/BatchUpload.tsx`          | Drag-and-drop CSV zone; format hint; results table (row, profile, matches, top trial, score); download CSV                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `graph/GraphTab.tsx`             | ForceGraph2D loaded in `useEffect`; `queueMicrotask` for loading state; ResizeObserver canvas sizing; legend; all states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `watchlist/WatchlistTab.tsx`     | Profiles grid; Run All button; new-match count banner; React-19-compliant effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `watchlist/WatchlistCard.tsx`    | Profile text; created date; match count; amber new-match badge; expand scored trials; delete; **Feature I:** notes textarea (auto-save on blur via `savedNotesRef` comparison; 500 char limit; char count turns amber at 90%; `notesSaved` flash feedback; `notes_updated_at` relative timestamp via `timeAgo()`)                                                                                                                                                                                                                                                                                                                                                                                              |
| `ingest/IngestTab.tsx`           | Auto-seed scheduler panel + **Feature N:** `<QualityPanel>` + **Feature O:** `<ReviewQueue>` + manual ingest grid; `getSeedStatus()` on mount; `triggerSeed()` on button click                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ingest/IngestForm.tsx`          | Trial ID input + textarea + gradient submit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ingest/EntityCard.tsx`          | Coloured chips with optional ICD-10 mono badge; `EntityItem` interface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ingest/IngestionResult.tsx`     | Success/`pending_review` banner + trial summary + entity grid; condition cards pass `{name, icd10_code}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ingest/QualityPanel.tsx`        | **Feature N:** collapsible health dashboard; `ScoreBadge` (emerald ≥80, amber ≥60, rose <60); `IssueRow` with expandable item chips + "Fix" button for `missing_icd10` that calls `fixMissingIcd10()` then re-loads; lazy-loads on first open; Refresh button                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ingest/ReviewQueue.tsx`         | **Feature O:** collapsible amber panel; auto-loads `fetchPendingReviews()` on mount; only renders if items present or loading; `ReviewCard` with `ConfidenceBadge`, expandable entity preview (conditions/medications), Approve (green) / Reject (red) per card; on action removes from local state immediately                                                                                                                                                                                                                                                                                                                                                                                                |
| `patients/PatientTab.tsx`        | **Feature M:** profiles grid; `listPatientProfiles()` on mount; create/update/delete handlers; `EmptyState`; `Skeleton` loading; `AnimatePresence` for `PatientForm` slide-over modal; `onMatchTrials` prop delegates to `page.tsx handleMatchFromPatient`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `patients/PatientCard.tsx`       | **Feature M:** name + age/gender + condition chips (indigo) + medication chips (emerald) + notes; confirm-delete flow; "Match Trials" button calls `assembleProfile(p)` → `onMatchTrials` callback; `assembleProfile()` builds natural-language string from structured fields                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `patients/PatientForm.tsx`       | **Feature M:** slide-over modal; `TagInput` sub-component for conditions/medications (Enter/comma to add, Backspace to remove, `onBlur` to commit current input); name/age/gender/notes fields; create + edit modes; violet submit button                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `settings/SettingsPanel.tsx`     | **Feature P:** slide-over with backdrop; `PROVIDERS` catalogue (ollama/openai/anthropic each with model list); provider selector (card buttons), model dropdown (native `<select>`), amber API-key info card for cloud providers, config summary row; Apply/Cancel buttons; `loadLlmSettings()` / `saveLlmSettings()` helpers using `STORAGE_KEY="ct_llm_settings"`; exports `LlmSettings` interface                                                                                                                                                                                                                                                                                                           |

### Completed Feature Build Log

#### ~~Feature 1 — Streaming Agent Execution (SSE)~~ ✅ COMPLETE

- `POST /api/v1/patients/match/stream` — FastAPI `StreamingResponse` using `agent_app.astream()`
- SSE events: `progress` (per node, with retry-aware label), `result` (full MatchResponse), `error`
- `streamMatchPatient()` async generator in `lib/api.ts` — POST + `ReadableStream` reader, SSE line parser with buffer
- `StreamingProgress.tsx` — framer-motion timeline of completed/active/errored nodes
- `MatchTab.tsx` — `for await` loop, `NEXT_ACTIVE_LABEL` map, progressive result reveal

#### ~~Feature 2 — Per-Trial Match Scoring + Explanation~~ ✅ COMPLETE

- `score_matches` node (Node 4 in LangGraph) — LLM outputs JSON array `[{trial_id, score, reasons[], concerns[]}]`; regex + default fallbacks; sorted desc
- `ScoredTrial` Pydantic model in `schema.py`; `scored_trials` field in `MatchResponse`
- `evaluate_results` now receives scored context (ID + score) for a richer verdict
- `TrialCard.tsx` — animated `ScoreBar` (emerald/amber/rose), expand/collapse panel with reasons (✓) and concerns (⚠)
- `MatchTab.tsx` — uses `scored_trials` when available, falls back to `trials.map(toUnscoredTrial)`

#### ~~Feature 3 — Knowledge Graph Visualiser~~ ✅ COMPLETE

- `graph.py get_subgraph(trial_ids)` — OPTIONAL MATCH Cypher, deduplicated node dict, typed link list
- `GET /api/v1/graph/subgraph?trial_ids=...` — FastAPI endpoint with `SubgraphResponse` model
- `fetchSubgraph()` in `lib/api.ts`; `SubgraphNode/Link/Data` types in `types/index.ts`
- `GraphTab.tsx` — `ForceGraph2D` loaded in `useEffect` (no `next/dynamic`); custom canvas rendering (glow, labels, arrow links, color by type); `queueMicrotask` for React 19 compliance; `ResizeObserver` responsive canvas; legend
- `Navbar.tsx` — 3rd "Graph" tab; `Tab` type exported
- `page.tsx` — `graphTrialIds` state, `handleVisualize` switches tab and passes IDs
- `MatchTab.tsx` — "Visualize Graph" button appears after successful match

#### ~~Feature 4 — FHIR Patient Import~~ ✅ COMPLETE

- `POST /api/v1/patients/match/fhir` in `routers/patients.py`
- `_parse_fhir_bundle()` — `Patient.birthDate` → age, `Patient.gender`, `Condition.code.text`, `MedicationStatement`/`MedicationRequest`; assembles natural-language query string
- `FhirBundle` Pydantic model; FHIR result cached under SHA256(patient_query)
- `matchFhirPatient()` in `lib/api.ts`
- `PatientInput.tsx` — "Free Text" / "FHIR JSON" pill toggle; JSON textarea with pre-filled FHIR R4 example bundle
- `MatchTab.tsx` — `mode === "fhir"` calls `matchFhirPatient()` (no SSE); shows parsed profile banner on result

#### ~~Feature 5 — Trial Watchlist + Background Monitoring~~ ✅ COMPLETE

- `src/watchlist.py` — `WatchlistManager`: `SavedProfile` nodes in Neo4j, `save_profile()`, `list_profiles()`, `delete_profile()`, `run_all(Callable[..., Any])`; diffs `current_ids` vs `last_trial_ids`; updates `last_trial_ids` after each run
- `watchlist_manager` singleton in `dependencies.py`; `routers/watchlist.py` — CRUD + `/watchlist/run`
- `seed.py __main__` — re-runs watchlist after seeding, logs new match count
- `Navbar.tsx` — 4th "Watchlist" tab
- `WatchlistTab.tsx` — profiles grid, "Run All" button, new-match count; React-19-compliant `useEffect`
- `WatchlistCard.tsx` — profile text, created date, total/new match counts, expand scored trials, delete
- `MatchTab.tsx` — "Save to Watchlist" button (violet → emerald on save), resets on new match

#### ~~Feature 6 — Reverse Matching ("Who fits this trial?")~~ ✅ COMPLETE

- `graph.py get_trial_context(trial_id)` — fetches Trial node properties + all relationship targets grouped by type
- `POST /api/v1/trials/{trial_id}/eligible-profile` in `routers/trials.py`
- `reverse_chain` in `dependencies.py` — `ChatOllama(temperature=0.3)` + 2-3 sentence profile prompt
- `EligibleProfileResponse` model (`trial_id`, `trial_title`, `ideal_profile`)
- `TrialCard.tsx` — "Who fits this trial?" button; lazy-fetch on first click; result cached in component state; toggle visibility on subsequent clicks; violet-accented `AnimatePresence` inline panel

#### ~~Feature 7 — Batch Patient Matching~~ ✅ COMPLETE

- `POST /api/v1/patients/match/batch` in `routers/patients.py` — `multipart/form-data` CSV upload
- CSV parsing with `csv.DictReader`; case-insensitive `profile` column lookup; `utf-8-sig` decode (strips BOM)
- `ThreadPoolExecutor(max_workers=3)`, `BATCH_MAX_ROWS=50`, `BATCH_LLM_TIMEOUT=150`; results in original row order
- `BatchMatchResult` model; `matchPatientsBatch(file)` in `lib/api.ts` — `FormData` POST, no manual `Content-Type`
- `BatchUpload.tsx` — drag-and-drop zone, CSV format hint, results table, client-side download CSV
- `MatchTab.tsx` — "Single Patient" / "Batch Upload" pill switcher

#### ~~Feature 8 — Redis Caching Layer~~ ✅ COMPLETE

- `redis==5.2.1` in `requirements.txt`; `redis:7-alpine` in `docker-compose.yml` with health check
- `dependencies.py` — `redis_client` singleton: `from_url()` + `ping()` at startup; `None` on failure. Helpers: `make_cache_key()` (SHA256), `cache_get()`, `cache_set()` (TTL=3600s), `cache_flush()` (flushdb)
- `routers/patients.py` — cache check/store in `match_patient` and `match_patient_fhir`; `X-Cache: HIT/MISS` + `Cache-Control` headers; SSE stream and batch intentionally uncached
- `routers/trials.py` — `cache_flush()` called after every successful ingestion

#### ~~Feature 9 — ICD-10 Code Mapping~~ ✅ COMPLETE

- `src/coding.py` — `map_to_icd10(condition_name)`: NIH NLM Clinical Tables API, 5s timeout, returns first code or `None`; warnings-only on failure
- `schema.py Condition` — `icd10_code: str | None = Field(default=None)` — populated post-extraction, not by LLM
- `graph.py` — `condition_icd10` index; conditions UNWIND passes `{name, code}` dicts; `COALESCE` on match
- `seed.py _process_trial` + `routers/trials.py ingest_trial` — both call `map_to_icd10()` after extraction, before ingestion
- `agent.py generate_cypher` — documents `icd10_code` in schema; Rule 1: ICD exact-match preferred over name CONTAINS
- `EntityCard.tsx` — ICD code shown as small mono badge inside chip with `title` tooltip

#### ~~Feature 10 — Trial Phase + Status Filtering~~ ✅ COMPLETE

- `graph.py` — `trial_phase` and `trial_status` indexes; `ingest_trial` accepts and stores `phase`/`status`
- `seed.py` — `TrialRecord` carries `phase`/`status`; `_parse_study` extracts from `designModule.phases[0]` + `statusModule.overallStatus`
- `agent.py GraphState` — `phase_filter`/`status_filter` fields; `generate_cypher` injects ACTIVE FILTERS block when set
- `routers/patients.py` — `?phase` and `?status` query params on `/match` and `/match/stream`; cache key includes filter values
- `match/PatientInput.tsx` — Phase I/II/III/IV + Recruiting/Active/Completed `FilterChip` rows (text mode only)
- `match/MatchTab.tsx` — `phase`/`status` state forwarded as `MatchFilters` to `streamMatchPatient`

#### ~~Feature 11 — Drug Interaction Check (OpenFDA)~~ ✅ COMPLETE

- `src/interactions.py` — `_get_interaction_text()` (OpenFDA single call), `get_interaction_texts()` (batch, once per patient med), `warnings_for_trial()` (pure in-memory per trial), `check_interactions()` (convenience wrapper)
- `graph.py get_trial_medications(trial_ids)` — single Cypher query returns `{trial_id: [med_names]}` for all matched trials
- `routers/patients.py` — `_extract_patient_meds()` parses LLM profile; `_enrich_with_interactions()` never raises; runs via `asyncio.to_thread` in SSE endpoint
- `models.py MatchResponse` — `interaction_warnings: list[str]`; `types/index.ts ScoredTrial` — `interaction_warnings?: string[]`
- `match/TrialCard.tsx` — amber `AlertTriangle` warning box always visible (not behind expand) since safety-critical

#### ~~Feature A — Trial Search / Browse~~ ✅ COMPLETE

- `GET /api/v1/trials/search?q=&condition=&phase=&status=&page=&limit=` in `routers/trials.py` — full-text + filter Cypher against Neo4j; `TrialSearchResponse` + `TrialSummary` models
- `searchTrials(filters)` in `lib/api.ts`; `TrialSearchResponse` type in `types/index.ts`
- `SearchTab.tsx` — new "Trials" tab with search bar, phase/status filter chips, paginated results table (trial ID, title, phase, status); `initialCondition` prop for pre-fill from Dashboard
- `Navbar.tsx` — "Trials" tab added; `Tab` type extended

#### ~~Feature B — Trial Detail Page~~ ✅ COMPLETE

- `GET /api/v1/trials/{trial_id}` in `routers/trials.py` — fetches Trial node + all relationships; `TrialDetail` model
- `fetchTrialDetail(trialId)` in `lib/api.ts`; `TrialDetail` type in `types/index.ts`
- `TrialDetailDrawer.tsx` — slide-in panel showing conditions, medications, exclusions, phase, status, age range, and "Who fits?" ideal profile (reuses `fetchEligibleProfile`)

#### ~~Feature C — Trial Landscape Dashboard~~ ✅ COMPLETE

- `GET /api/v1/graph/stats` in `routers/graph.py` — aggregate Cypher: trial count, condition count, phase distribution, status distribution, recent ingestions; `GraphStats` model
- `fetchGraphStats()` in `lib/api.ts`; `GraphStats` type in `types/index.ts`
- `DashboardTab.tsx` — new "Dashboard" tab with summary stat cards; plain SVG bar/pie charts; `onFindTrials` callback to pre-fill Trials tab

#### ~~Feature D — Trial Comparison View~~ ✅ COMPLETE

- Frontend only — no new backend endpoints
- Checkboxes on `TrialCard` (via `selected` + `onToggleSelect` props); `selectedIds` state in `MatchTab`
- `CompareModal.tsx` — side-by-side table (score, phase, status, age range, conditions, medications, reasons, concerns); framer-motion slide-up; close button

#### ~~Feature E — Condition Trend Explorer~~ ✅ COMPLETE

- `GET /api/v1/graph/conditions?status=&limit=` in `routers/graph.py` — conditions with trial counts, optional status filter; `ConditionStat` model
- `fetchConditions(status?, limit?)` in `lib/api.ts`; `ConditionStat` type in `types/index.ts`
- Rendered in `DashboardTab.tsx` — condition cards with ICD-10 code badge, trial count, "Find Trials" button that calls `onFindTrials(condition.name)`

#### ~~Feature F — Similar Trials~~ ✅ COMPLETE

- `graph.py get_similar_trials(trial_id, exclude_ids, limit)` — graph traversal via `[:TREATS|USES_MEDICATION]`; `[x IN collect(DISTINCT shared) WHERE x:Condition | x.name]` list comprehensions; ranked by overlap count; deduplicated
- `GET /api/v1/trials/{trial_id}/similar?exclude=&limit=` in `routers/trials.py`; `SimilarTrial` model
- `SimilarTrial` interface in `types/index.ts`; `fetchSimilarTrials(trialId, excludeIds)` in `lib/api.ts`
- `SimilarTrialsPanel.tsx` — lazy-fetches on mount via `queueMicrotask` (React 19 rule); collapsible with count badge; rose condition chips + sky medication chips; "View" button opens `TrialDetailDrawer`
- `MatchTab.tsx` — renders `<SimilarTrialsPanel topTrialId={displayTrials[0]?.trial_id} excludeIds={...} />` before `<CypherTrace>`

#### ~~Feature G — Match History~~ ✅ COMPLETE

- `graph.py` — `match_history_id` + `match_history_created_at` indexes; `save_match_history(profile, top_trial_id, top_trial_title, top_score, total_matches)` — `CREATE (:MatchHistory {...})`; `list_match_history(limit)` — ordered `DESC`
- `MatchHistoryItem` model in `models.py`; `types/index.ts` interface added
- `routers/patients.py` — `_save_history(result: dict)` helper (never raises; explicit type annotations for pylance); called after `cache_set` in `match_patient` and `match_patient_fhir`; `result_data` dict + `await asyncio.to_thread(_save_history, result_data)` in SSE endpoint; `GET /api/v1/history?limit=` endpoint
- `fetchMatchHistory(limit)` in `lib/api.ts`
- `MatchHistory.tsx` — collapsible list; `refreshKey` prop triggers re-fetch; `onRerun(profile)` callback; relative timestamps via `timeAgo()`; Re-run button per entry
- `MatchTab.tsx` — `historyKey` state (incremented in `finally`); `handleRerun` sets `profileOverride` for `handleMatch`; `profileOverride?: string` pattern avoids stale-state re-run issue

#### ~~Feature I — Clinician Notes~~ ✅ COMPLETE

- `watchlist.py` — `update_notes(profile_id, notes)` — Cypher `SET p.notes = $notes, p.notes_updated_at = $updated_at`; `list_profiles()` now returns `notes` + `notes_updated_at`
- `UpdateNotesRequest` model in `models.py`; `WatchlistProfileResponse` extended with `notes: str | None` + `notes_updated_at: str | None`
- `PATCH /api/v1/watchlist/{profile_id}/notes` in `routers/watchlist.py`
- `updateWatchlistNotes(id, notes)` in `lib/api.ts`; `WatchlistProfile` type updated in `types/index.ts`
- `lib/utils.ts` — new shared `export function timeAgo(isoString: string): string` (extracted to avoid duplication between `MatchHistory.tsx` and `WatchlistCard.tsx`)
- `WatchlistCard.tsx` — notes textarea: auto-save on blur (only if text changed, tracked via `savedNotesRef`); 500 char limit; char count turns amber at 90%; `notesSaved` flash feedback; `notes_updated_at` relative timestamp

#### ~~Feature H — Medication Explorer~~ ✅ COMPLETE

- `graph.py` — `search_medications(query, limit)` — Cypher `CONTAINS toLower($query)` on `(:Medication)` nodes, ordered + limited; `get_medication_detail(name)` — traverses `[:USES_MEDICATION]` to find all trials, collects co-occurring `[:TREATS]` conditions per trial, returns `{trials: list[dict], conditions: sorted list}`
- `models.py` — `MedicationTrialSummary` (trial_id, title, phase, status); `MedicationDetailResponse` (name, trials, conditions, interaction_text)
- `src/routers/medications.py` — new router; `GET /medications/search?q=&limit=`; `GET /medications/{name}` — fetches graph detail + OpenFDA interaction text via `get_interaction_texts([name])`; catches `requests.exceptions.RequestException` specifically (not bare `Exception`)
- `src/api.py` — imports and registers medications router under `/api/v1`
- `types/index.ts` — `MedicationTrialSummary`, `MedicationDetail` interfaces added
- `lib/api.ts` — `searchMedications(q)`, `fetchMedicationDetail(name)` added; `MedicationDetail` imported
- `components/search/MedicationExplorer.tsx` — new; search input with 300ms debounce → suggestion list; select → full detail panel; `StatusBadge` for phase/status; amber OpenFDA warning card; teal condition chips; trials list with `TrialDetailDrawer` on click
- `components/search/SearchTab.tsx` — mode pill switcher ("By Trial" / "By Medication") at top; `mode` state; React 19 fix (`queueMicrotask` for `setCondition` in `useEffect`); trial search UI conditionally rendered under `mode === "trials"`; `<MedicationExplorer/>` rendered under `mode === "medications"`

#### ~~Feature J — Side Effect Profile~~ ✅ COMPLETE

- `schema.py ScoredTrial` — `side_effect_flags: List[str] = Field(default_factory=list)`
- `interactions.py` — `_get_adverse_reactions(med_name)` — OpenFDA `adverse_reactions` field (5s timeout, silent on failure); `get_adverse_reaction_texts(trial_meds)` — batch fetch for unique trial medications; `side_effects_for_trial(adverse_texts, trial_meds, patient_conditions)` — keyword cross-reference, returns human-readable flag strings
- `routers/patients.py` — `_extract_patient_conditions()` regex parser (`_CONDITIONS_RE`); `_enrich_with_interactions()` extended to collect all unique trial meds, fetch adverse reactions once each, cross-reference per trial; `side_effect_flags` injected into each `ScoredTrial` dict
- `types/index.ts ScoredTrial` — `side_effect_flags?: string[]`
- `TrialCard.tsx` — rose collapsible "side effect risks" section (`sideEffectsExpanded` state, `hasSideEffectFlags` computed); toggle button sits outside `p-5` div at same level as other section toggles (structural fix)

#### ~~Feature K — Export to FHIR / HL7~~ ✅ COMPLETE

- Pure frontend — no new backend endpoints; all data sourced from existing `MatchResponse` state
- `ExportFhirButton.tsx` — new component; inline `uuidv4()` helper (no external dep); builds FHIR R4 `Bundle` (type: `"collection"`) containing: `Patient` (profile text as narrative div), `Observation` (agent verdict, LOINC 75326-9), and per trial: `ResearchStudy` (NCT identifier + title) + `RiskAssessment` (score as `probabilityDecimal 0.0–1.0`, reasons as `rationale`, concerns as `note[]`, drug interaction warnings as FHIR `extension`); downloads `trial-match-FHIR-YYYY-MM-DD.json` with `application/fhir+json` MIME type; teal color scheme; exported/exporting state with 3s flash feedback
- `MatchTab.tsx` — import added; action grid changed from `grid-cols-3` → `grid-cols-2` (2×2 layout); `<ExportFhirButton result={result} displayTrials={displayTrials} />` added as 4th button

#### ~~Feature L — Trial Eligibility Explainer~~ ✅ COMPLETE

- `graph.py` — `get_trial_criteria(trial_id)` — single Cypher query: fetches `t.min_age`, `t.max_age`, `[:TREATS]→Condition`, `[:EXCLUDES_CONDITION]→Condition`, `[:EXCLUDES_MEDICATION]→Medication`; returns clean `dict` with empty-string-filtered lists
- `models.py` — `EligibilityCriterion` (criterion, verdict, reason); `EligibilityRequest` (profile); `EligibilityResponse` (trial_id, criteria)
- `dependencies.py` — `eligibility_chain = ChatOllama(model="llama3", temperature=0)` singleton (temperature=0 for deterministic evaluation)
- `routers/trials.py` — `_parse_eligibility(raw, fallback_criteria)` — tries `json.loads`, then regex `\[.*\]`, then all-unknown fallback; `POST /trials/{trial_id}/eligibility` — builds numbered criteria list from graph data, constructs prompt, invokes `eligibility_chain`, parses response; returns HTTP 404 if trial not found; returns empty `criteria=[]` if no structured criteria available
- `types/index.ts` — `EligibilityCriterion`, `EligibilityResponse` interfaces added
- `lib/api.ts` — `fetchEligibility(trialId, profile)` — POST with JSON body; `EligibilityResponse` added to imports
- `TrialCard.tsx` — `patientProfile?: string` added to `TrialCardProps`; `eligibility/eligibilityOpen/eligibilityLoading/eligibilityError` state; `handleEligibility` lazy-fetch (same pattern as `handleWhoFits`); button gated with `{patientProfile && (...)}` — hidden when no profile context (e.g. WatchlistCard); animated panel with `CheckCircle2` emerald (pass), `AlertTriangle` rose (fail), `ListChecks` slate (unknown) per row + one-sentence reason
- `MatchTab.tsx` — `patientProfile={result.patient_profile}` passed to every `<TrialCard>`

#### ~~Feature M — Patient History Timeline~~ ✅ COMPLETE

- `graph.py` — `create_patient_profile()`, `get_patient_profile()`, `list_patient_profiles()`, `update_patient_profile()` (uses `SET p += $props` map-merge — avoids f-string dynamic Cypher), `delete_patient_profile()` — all use `self.driver.session()`; `patient_profile_id` index in `_ensure_indexes()`
- `models.py` — `PatientProfileCreate`, `PatientProfileUpdate`, `PatientProfileResponse`
- `routers/patient_profiles.py` — new router; `POST /patient-profiles` (201), `GET /patient-profiles`, `GET /patient-profiles/{id}` (404 if missing), `PATCH /patient-profiles/{id}` (422 if no fields in body), `DELETE /patient-profiles/{id}` (204)
- `api.py` — `patient_profiles_router` registered under `/api/v1`; `"PATCH"` added to CORS `allow_methods`
- `types/index.ts` — `PatientProfile` interface added
- `lib/api.ts` — `listPatientProfiles()`, `createPatientProfile()`, `updatePatientProfile()`, `deletePatientProfile()` added
- `PatientTab.tsx` — profiles grid; list/create/update/delete handlers; `AnimatePresence` slide-over for form modal; `Skeleton` and `EmptyState`
- `PatientCard.tsx` — structured patient display; `assembleProfile()` builds natural-language string; "Match Trials" button → `onMatchTrials(assembleProfile(p))` → `page.tsx handleMatchFromPatient`
- `PatientForm.tsx` — `TagInput` subcomponent for array fields; create/edit mode
- `Navbar.tsx` — "Patients" tab added; `UserCircle` icon
- `page.tsx` — `matchInitialProfile` + `matchKey` state; `handleMatchFromPatient(profileText)` sets profile, increments matchKey to force MatchTab remount so `useState(initialProfile)` picks up new value

#### ~~Feature N — Graph Quality Dashboard~~ ✅ COMPLETE

- `graph.py get_graph_quality()` — 7 Cypher queries in one session: total trials, missing phase count+ids, missing status count+ids, zero-conditions count+ids, missing icd10 count+names, total conditions, pending reviews; health score formula: 100 − (pct_missing_phase×20) − (pct_missing_status×20) − (pct_zero_conditions×30) − (pct_missing_icd10×30); all Cypher strings use triple-quoted literals (LiteralString compliance)
- `graph.py fix_missing_icd10()` — lazy-imports `map_to_icd10`, fetches all conditions with NULL icd10_code, bulk-updates with `UNWIND $updates ... SET c.icd10_code = u.code`; returns count of enriched conditions
- `models.py` — `QualityIssue` (type, label, count, items); `GraphQualityResponse` (health_score, total_trials, pending_reviews, issues)
- `routers/graph.py` — `GET /graph/quality` → `GraphQualityResponse`; `POST /graph/quality/fix-icd10` → `{fixed: int}`
- `types/index.ts` — `QualityIssue`, `GraphQuality` interfaces added
- `lib/api.ts` — `fetchGraphQuality()`, `fixMissingIcd10()` added
- `QualityPanel.tsx` — lazy-loads on first open (collapsible); `ScoreBadge` (emerald/amber/rose); `IssueRow` expandable; "Fix" button calls `fixMissingIcd10()` then refreshes; Refresh button
- `IngestTab.tsx` — `<QualityPanel>` added between scheduler panel and manual ingest grid

#### ~~Feature O — Confidence Scores on Extraction~~ ✅ COMPLETE

- `extract.py` — `CONFIDENCE_THRESHOLD = 0.6`; `assess_extraction_confidence(text, entities)` — LLM second-pass self-evaluation, regex extracts float, returns 1.0 on failure (never blocks ingestion)
- `graph.py` — `ingest_pending_review(trial_id, text, extracted_json, confidence)` — creates `(:PendingReview)` node; `list_pending_reviews()` — returns ordered list; `approve_pending_review(review_id)` — deserializes `ExtractedEntities` from stored JSON, re-enriches ICD-10, calls `ingest_trial()`, deletes review node; `reject_pending_review(review_id)` — deletes node; `pending_review_id` index; all methods use `self.driver.session()`
- `models.py` — `PendingReviewItem` (id, trial_id, trial_title, confidence, created_at, extracted_json)
- `routers/trials.py` — `ingest_trial()` now calls `assess_extraction_confidence` after ICD enrichment; routes to `ingest_pending_review` if confidence < threshold (returns `status="pending_review"`); `GET /trials/review` declared BEFORE `GET /trials/{trial_id}` to avoid FastAPI routing conflict; `POST /trials/review/{id}/approve`; `POST /trials/review/{id}/reject`
- `seed.py` — `_process_trial()` imports and calls `assess_extraction_confidence`; routes to `ingest_pending_review` when below threshold
- `types/index.ts` — `PendingReviewItem` interface added
- `lib/api.ts` — `fetchPendingReviews()`, `approvePendingReview()`, `rejectPendingReview()` added
- `ReviewQueue.tsx` — autoloads on mount; only renders if items present; `ReviewCard` with `ConfidenceBadge`; Approve/Reject with optimistic local state removal
- `IngestTab.tsx` — `<ReviewQueue>` added below `<QualityPanel>`

#### ~~Feature P — Multi-LLM Support~~ ✅ COMPLETE

- `dependencies.py` — `BaseChatModel` imported from `langchain_core`; `_llm_cache: dict[tuple[str, str], BaseChatModel]`; `_create_llm(provider, model)` — lazy-imports `ChatOpenAI`/`ChatAnthropic` (optional deps, avoids requiring keys at import time); `get_llm(provider?, model?)` — reads `LLM_PROVIDER`/`LLM_MODEL` env vars as defaults, caches by `(provider, model)` key
- `agent.py` — removed module-level `llm = ChatOllama(...)`; removed `from langchain_ollama import ChatOllama`; added `from src.dependencies import get_llm`; `GraphState` extended with `llm_provider: NotRequired[str | None]` and `llm_model: NotRequired[str | None]`; all 4 nodes (`analyze_query`, `generate_cypher`, `score_matches`, `evaluate_results`) call `get_llm(state.get("llm_provider"), state.get("llm_model"))`
- `extract.py` — `llm = ChatOllama(model=os.getenv("LLM_MODEL", "llama3"), ...)` reads model from env
- `routers/patients.py` — `?provider` and `?model` query params added to `/patients/match` and `/patients/match/stream`; injected into `GraphState`; cache key extended to include `|provider=...|model=...`
- `.env` — `LLM_PROVIDER=ollama`, `LLM_MODEL=llama3`, commented `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`
- `lib/api.ts` — `MatchFilters` extended with `provider?: string | null; model?: string | null`; `matchPatient()` and `streamMatchPatient()` forward them as `?provider=&model=` query params
- `SettingsPanel.tsx` — new `components/settings/` directory; `PROVIDERS` catalogue with models per provider; provider card selector + model `<select>`; amber API-key warning for cloud providers; Apply saves to `localStorage` via `saveLlmSettings()`; `loadLlmSettings()` exported for `page.tsx` to call in `useEffect`; `LlmSettings` interface exported
- `page.tsx` — `settingsOpen`, `llmSettings` state; `useEffect(() => { setLlmSettings(loadLlmSettings()) }, [])` (localStorage read after hydration); `<SettingsPanel>` rendered; `llmProvider`/`llmModel` passed to `MatchTab`
- `MatchTab.tsx` — `llmProvider?`/`llmModel?` props; forwarded to `streamMatchPatient` filters
- `Navbar.tsx` — `onSettingsClick?`/`llmLabel?` props; gear icon button with truncated provider/model label; brand subtitle shows active LLM when `llmLabel` present

---

## Rules for This Project

- **Never modify files directly** without showing the user the code first. User makes the changes themselves.
- **Always check this file first** before starting any new feature — implementation notes are already written above.
- **Do not skip type annotations** — pylance strict mode is in use. Use `state.get("key", default)` for `NotRequired` TypedDict fields. Use `default=None` (not positional `None`) in Pydantic `Field()`.
- **No new `print()` statements** — use `logging.getLogger(__name__)` in all Python files. Exception: `__main__` blocks for manual script testing only.
- **No per-request `GraphManager()` instances** — use the module-level singleton from `dependencies.py`.
- **Do not add `timeout` to `ChatOllama`** — the parameter does not exist. Timeouts are handled at `future.result(timeout=150)`.
- **Frontend API URL** always comes from `process.env.NEXT_PUBLIC_API_URL` via `lib/api.ts`. Never hardcode.
- **Tests must not require Ollama, Neo4j, or Redis** — mock everything external. Patch targets are now `src.routers.*`, not `src.api.*`.
- **`seed.py` default limit** is 10 in the function signature, 100 in `__main__`. Keep this distinction.
- **`test_extraction.py` no longer exists** — it was replaced by `test_schema.py`. Do not recreate it.
- **When adding a new planned feature**, update the Future Implementation Order table to mark it complete, move the feature header to struck-through (~~Feature X~~) with ✅ COMPLETE, and replace the bullet-point plan with a "What was built" summary in the Completed Feature Build Log above.
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
- **`_save_history()` explicit type annotations required** — `result.get("scored_trials")` returns `Any`; pylance requires `scored: list[dict] = result.get("scored_trials") or []`, `top: dict | None = scored[0] if scored else None`, and `if top is not None` (not `if top`) to avoid false positives. Same pattern for all `dict.get()` calls that feed into typed parameters.
- **`profileOverride` pattern for re-run from history** — `handleMatch(profileOverride?: string)` uses `profileToUse = profileOverride ?? profile` to avoid stale React state when triggering a re-run without waiting for `setProfile()` to settle.
- **`refreshKey` counter pattern** — `historyKey` state in `MatchTab` is incremented (via `setHistoryKey(k => k + 1)`) in the `finally` block after each match; `MatchHistory` uses it as a `useEffect` dependency to re-fetch without unmounting/remounting.
- **`savedNotesRef` for auto-save optimization** — `WatchlistCard` tracks the last-saved notes text in a `useRef`. `handleNotesBlur` skips the API call if the current textarea value matches `savedNotesRef.current`, preventing redundant PATCH requests when the user clicks away without making changes.
- **`MatchHistory` nodes created on first match** — indexes (`match_history_id`, `match_history_created_at`) are registered at startup by `_ensure_indexes()`, but the label `(:MatchHistory)` doesn't appear in the graph until the first `_save_history()` call runs. This is normal Neo4j behavior — nodes are created lazily.
- **Side effect toggle button must be outside the `p-5` div in `TrialCard.tsx`** — the drug interaction box lives inside `<div className="p-5 space-y-4">`, but the side effects toggle is a full-width bordered section divider (like "Show reasons" and "Who fits?"). Placing it inside the padded div renders it incorrectly. All section toggle buttons must be siblings of the `p-5` div, not children.
- **`timeAgo()` lives in `lib/utils.ts`, not in components** — shared by `MatchHistory.tsx` and `WatchlistCard.tsx`. The file must use `export function timeAgo(...)` (not a default export, not a plain function without `export`). TypeScript requires the `export` keyword for a `.ts` file to be treated as a module.
- **FHIR export is pure frontend — no backend round-trip** — consistent with the jsPDF pattern in `DownloadReportButton.tsx`. The `ExportFhirButton` builds the bundle entirely from the `MatchResponse` already in component state. Do not add a `/export/fhir` backend endpoint.
- **`uuidv4()` is inlined in `ExportFhirButton.tsx`** — uses a `Math.random()` fallback to avoid importing a `uuid` package. Do not add a dependency for this; the inline helper is sufficient for non-cryptographic resource identifiers.
- **FHIR `probabilityDecimal` is `score / 100`** — the match score (0–100 integer) is converted to a decimal probability (0.0–1.0) rounded to 2 decimal places. Keep this conversion in sync if the score scale ever changes.
- **Action row is a 2×2 grid** — `MatchTab.tsx` uses `grid grid-cols-2 gap-3` for the 4-button action row (Visualize Graph, Save to Watchlist, Download Report, Export FHIR). Do not revert to `grid-cols-3` or `grid-cols-4`.
- **`except requests.exceptions.RequestException` not bare `except Exception`** — all OpenFDA/external HTTP calls in routers must catch the specific `requests` exception hierarchy. Bare `Exception` is flagged by the linter. Always `import requests` at the top of any router that wraps HTTP calls.
- **`SearchTab` mode switcher resets on navigation** — `mode` state is local to `SearchTab`; switching away from "By Trial" and back resets the medication explorer state. This is intentional — no persistence is needed.
- **Eligibility button is gated on `patientProfile` prop** — `{patientProfile && (<button...>)}` ensures the "Eligibility Breakdown" button only renders when a patient profile is available. Do not render it unconditionally — eligibility is meaningless without a specific patient context.
- **`eligibility_chain` uses `temperature=0`** — deterministic output is essential for pass/fail evaluation; unlike `reverse_chain` (temperature=0.3 for creative prose), eligibility must be reproducible. Do not change this.
- **`_parse_eligibility` fallback returns all-unknown, never crashes** — consistent with the `score_matches` JSON fallback pattern. A bad LLM response produces `verdict="unknown"` entries rather than a 500 error.
- **`POST /trials/{trial_id}/eligibility` not `GET`** — the patient profile is sent in the request body; GET requests cannot carry a JSON body reliably. Keep this as POST.
- **`update_patient_profile` uses `SET p += $props`** — Neo4j map-merge syntax that only touches keys present in `$props`. Do not build a dynamic f-string Cypher — it creates a `LiteralString` type error in pylance and is a SQL-injection-style risk.
- **Patient profile driver access uses `self.driver.session()`** — all 5 patient profile CRUD methods in `GraphManager` use `self.driver` (set in `__init__`), not `self._get_driver()`. The `_get_driver()` free function exists only in `agent.py` for the agent's own direct Neo4j access.
- **`CONFIDENCE_THRESHOLD = 0.6` is a module constant in `extract.py`** — do not hardcode 0.6 inside `_process_trial()` or `ingest_trial()`. Import it from `extract.py` at call sites.
- **`assess_extraction_confidence` always returns 1.0 on any failure** — the second LLM call is advisory; if it crashes or returns garbage, ingestion proceeds normally (confidence = 1.0, goes to `(:Trial)` not `(:PendingReview)`). This ensures ingestion is never blocked.
- **`GET /trials/review` must be declared before `GET /trials/{trial_id}`** — FastAPI matches routes in declaration order; without this, "review" would be matched as a `trial_id` path parameter.
- **`approve_pending_review` lazy-imports `ExtractedEntities` and `map_to_icd10`** — these are imported inside the method to avoid circular imports at module load time.
- **`key={matchKey}` pattern for Patient → Match navigation** — incrementing `matchKey` in `handleMatchFromPatient` forces `MatchTab` to remount so `useState(initialProfile)` picks up the new value. A `useEffect` on `initialProfile` inside MatchTab would also work but introduces a dependency that could cause double-renders.
- **`get_llm()` caches LLM instances by `(provider, model)` key** — `_llm_cache` is a module-level dict in `dependencies.py`. The first call for a given `(provider, model)` pair creates and stores the instance; subsequent calls return the cached one. This is thread-safe because Python dict reads/writes under the GIL are atomic for simple key lookups.
- **`ChatOpenAI` and `ChatAnthropic` are lazy-imported inside `_create_llm()`** — these are optional dependencies (`langchain_openai`, `langchain_anthropic`). Importing them at the top of `dependencies.py` would cause `ImportError` for users who only have `langchain_ollama` installed. The lazy import pattern means users only need the relevant package for their chosen provider.
- **LLM provider selection persists in `localStorage`** — key `"ct_llm_settings"`. On initial render, `page.tsx` reads it via `loadLlmSettings()` inside a `useEffect` (not at component level) to avoid SSR hydration mismatch. Default is `{provider: "ollama", model: "llama3"}`.
- **`SettingsPanel` is a floating overlay, not a drawer** — it appears anchored below the navbar gear icon (`right-4 top-20`) using `motion.div` with scale + translate animation. Clicking outside the panel (via `mousedown` listener on `document`) closes it. Do not implement as a route or a page-level modal.
- **Provider/model filter cache key extension** — `make_cache_key(f"{profile}|phase={...}|status={...}|provider={provider or ''}|model={model or ''}")`. A match run with GPT-4o must not return a cached Llama3 result.
- **`LlmSettings` interface exported from `SettingsPanel.tsx`** — import it from there everywhere. Do not redefine in `page.tsx` or elsewhere.

---

## Future Feature Backlog

All 16 features below are designed and ready to implement. Work through them in the recommended order — each builds on what came before.

---

### 🟢 Quick Wins

#### ~~Feature A — Trial Search / Browse~~ ✅ COMPLETE
#### ~~Feature B — Trial Detail Page~~ ✅ COMPLETE
#### ~~Feature C — Trial Landscape Dashboard~~ ✅ COMPLETE
#### ~~Feature D — Trial Comparison View~~ ✅ COMPLETE
#### ~~Feature E — Condition Trend Explorer~~ ✅ COMPLETE

---

### 🟡 Medium Effort

#### ~~Feature F — Similar Trials~~ ✅ COMPLETE
#### ~~Feature G — Match History~~ ✅ COMPLETE

#### ~~Feature H — Medication Explorer~~ ✅ COMPLETE

#### ~~Feature I — Clinician Notes~~ ✅ COMPLETE
#### ~~Feature J — Side Effect Profile~~ ✅ COMPLETE
#### ~~Feature K — Export to FHIR / HL7~~ ✅ COMPLETE
Export match results as a FHIR R4 Bundle that can be imported into EHR systems.
- Backend: `GET /api/v1/patients/match/{session_id}/export/fhir` — serialises `MatchResponse` into a FHIR R4 Bundle with `Patient`, `ResearchStudy` (one per trial), and `RiskAssessment` (score + verdict) resources
- Frontend: "Export FHIR" button in the action row alongside "Download Report"; downloads as `.json`

---

### 🔴 Bigger Builds

#### ~~Feature L — Trial Eligibility Explainer~~ ✅ COMPLETE
#### ~~Feature M — Patient History Timeline~~ ✅ COMPLETE
#### ~~Feature N — Graph Quality Dashboard~~ ✅ COMPLETE
#### ~~Feature O — Confidence Scores on Extraction~~ ✅ COMPLETE
#### ~~Feature P — Multi-LLM Support~~ ✅ COMPLETE

---

## Future Implementation Order

| Priority | Feature | Description                     | Effort    | Builds on             | Status     |
|----------|---------|---------------------------------|-----------|-----------------------|------------|
| 1        | A       | Trial Search / Browse           | 🟢 Quick  | —                     | ✅ COMPLETE |
| 2        | B       | Trial Detail Page               | 🟢 Quick  | A                     | ✅ COMPLETE |
| 3        | C       | Trial Landscape Dashboard       | 🟢 Quick  | —                     | ✅ COMPLETE |
| 4        | D       | Trial Comparison View           | 🟢 Quick  | existing match        | ✅ COMPLETE |
| 5        | E       | Condition Trend Explorer        | 🟢 Quick  | C                     | ✅ COMPLETE |
| 6        | F       | Similar Trials                  | 🟡 Medium | A, B                  | ✅ COMPLETE |
| 7        | G       | Match History                   | 🟡 Medium | —                     | ✅ COMPLETE |
| 8        | I       | Clinician Notes                 | 🟡 Medium | existing watchlist    | ✅ COMPLETE |
| 9        | J       | Side Effect Profile             | 🟡 Medium | existing interactions | ✅ COMPLETE |
| 10       | K       | Export to FHIR / HL7            | 🟡 Medium | existing match        | ✅ COMPLETE |
| 11       | H       | Medication Explorer             | 🟡 Medium | A, B                  | ✅ COMPLETE |
| 12       | L       | Trial Eligibility Explainer     | 🔴 Bigger | B                     | ✅ COMPLETE |
| 13       | M       | Patient History Timeline        | 🔴 Bigger | G                     | ✅ COMPLETE |
| 14       | N       | Graph Quality Dashboard         | 🔴 Bigger | existing ingest       | ✅ COMPLETE |
| 15       | O       | Confidence Scores on Extraction | 🔴 Bigger | N                     | ✅ COMPLETE |
| 16       | P       | Multi-LLM Support               | 🔴 Bigger | —                     | ✅ COMPLETE |
