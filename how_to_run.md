# Healthcare GraphRAG: Quick Start Guide

## Environment used

```bash
conda activate graphrag_env
```

## 1. Boot Infrastructure

Ensure Docker Desktop is open, then start the Neo4j database:

```bash
docker-compose up -d

Access the visual Neo4j Browser at: http://localhost:7474
```

## 2. Boot Local LLM (Ollama)

```bash
brew services start ollama

(To verify it is running: curl http://localhost:11434)
```

## 3. Activate Python Environment

```bash
conda activate graphrag_env
```

## 4. Seed data from clinicaltrials.gov

```bash
python -m src.seed
```

## 5. Useful Teardown Commands

```bash
# Stop the database
docker-compose down

# Stop the LLM server
brew services stop ollama
```
