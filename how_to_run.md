# Healthcare Clinical Trial Matching — Run Guide

## Prerequisites (First Time Only)

### 1. Pull the Ollama model
```bash
ollama pull llama3
```
Verify the model is available:
```bash
ollama list
```

### 2. Install Python dependencies
```bash
conda activate graphrag_env
pip install -r requirements.txt
```

### 3. Install frontend dependencies
```bash
cd frontend
npm install
cd ..
```

---

## Starting the Stack

Run these steps **in order** — each layer depends on the one before it.

### Step 1 — Start Docker Desktop
Open the Docker Desktop app and wait until the engine shows **"Running"**.

### Step 2 — Start Neo4j + Redis
```bash
docker-compose up -d
```
Wait ~15 seconds for Neo4j to fully initialize before proceeding.

| Service            | URL / Port              |
|--------------------|-------------------------|
| Neo4j Bolt         | `bolt://localhost:7687` |
| Neo4j Browser (UI) | http://localhost:7474   |
| Redis              | `localhost:6379`        |

### Step 3 — Start Ollama (local LLM)
```bash
brew services start ollama
```
Verify it's running:
```bash
curl http://localhost:11434
# Expected: "Ollama is running"
```

### Step 4 — Activate Python environment
```bash
conda activate graphrag_env
```

### Step 5 — Start the FastAPI backend
```bash
uvicorn src.api:app --reload --port 8000
```
The API is live at http://localhost:8000.  
On first run you'll see Neo4j indexes being created in the logs — this is normal.

### Step 6 — Seed clinical trial data (first time, or when you want fresh data)
Open a **new terminal tab**, then:
```bash
conda activate graphrag_env
python -m src.seed
```
This fetches 100 trials from ClinicalTrials.gov, extracts entities with Llama3, maps ICD-10 codes, and writes everything to Neo4j.  
**Expected duration:** 10–20 minutes depending on Ollama speed.

> Trials where extraction confidence is below 0.6 are placed in a **Pending Review** queue rather than ingested directly. You can approve or reject them from the **Ingest** tab.

### Step 7 — Start the frontend
Open another **new terminal tab**:
```bash
cd frontend
npm run dev
```
The app is live at http://localhost:3000.

---

## What You Can Do

| Tab           | Purpose                                                                 |
|---------------|-------------------------------------------------------------------------|
| **Match**     | Paste a patient profile in natural language → get ranked, scored trials |
| **Trials**    | Browse and search all seeded trials by condition, phase, or status      |
| **Dashboard** | Overview: trial counts, phase distribution, condition trends            |
| **Graph**     | Force-directed visualisation of the trial knowledge graph               |
| **Watchlist** | Save patient profiles; re-run matching to detect new trials             |
| **Patients**  | Store structured patient profiles; click "Match Trials" to run matching |
| **Ingest**    | Manually add a trial, review the pending queue, inspect graph quality   |

---

## Switching LLM Provider

The default LLM is **Ollama / llama3** (fully local, no API key needed).  
To use OpenAI or Anthropic:

1. Add the relevant key to `.env`:
   ```
   OPENAI_API_KEY=sk-...
   # or
   ANTHROPIC_API_KEY=sk-ant-...
   ```
2. In the app, click the **gear icon** (⚙) in the top navbar to open LLM Settings.
3. Select your provider and model, then click **Apply**.

The selection persists in your browser's `localStorage`.

---

## Subsequent Runs (after first-time setup)

You do **not** need to re-seed or re-install. Just:

```bash
docker-compose up -d                        # Neo4j + Redis
brew services start ollama                  # Ollama
conda activate graphrag_env && uvicorn src.api:app --reload --port 8000   # Backend
cd frontend && npm run dev                  # Frontend
```

---

## Teardown

```bash
# Stop frontend — Ctrl+C in that terminal

# Stop backend — Ctrl+C in that terminal

# Stop Neo4j + Redis (data is preserved in Docker volumes)
docker-compose down

# Stop Ollama
brew services stop ollama
```

To also **wipe all data** from Neo4j:
```bash
docker-compose down -v
```
> ⚠️ This deletes the Neo4j volume — you will need to re-seed after doing this.

---

## Troubleshooting

| Symptom                           | Fix                                                                                                                   |
|-----------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| `Connection refused` on Neo4j     | Wait a few more seconds after `docker-compose up -d` and retry                                                        |
| `Ollama is not running` error     | Run `brew services start ollama`, then verify with `curl http://localhost:11434`                                      |
| Seed takes very long / hangs      | Normal — Ollama processes each trial sequentially. Check `brew services info ollama` for errors                       |
| Frontend shows API errors         | Confirm the backend is running on port 8000 and `frontend/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:8000` |
| Redis unavailable warning in logs | Non-fatal — the app runs without Redis; caching is simply disabled                                                    |
