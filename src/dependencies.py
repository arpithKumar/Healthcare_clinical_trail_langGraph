import hashlib
import logging
import os

import redis as redis_lib
from dotenv import load_dotenv
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama

from src.graph import GraphManager
from src.watchlist import WatchlistManager

load_dotenv()

logger = logging.getLogger(__name__)

# ── Singletons ────────────────────────────────────────────────────────────────

graph_manager = GraphManager()
watchlist_manager = WatchlistManager(graph_manager.driver)

# ── Redis cache (optional — graceful degradation if unavailable) ──────────────

_CACHE_TTL = 3600  # 1 hour

_redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
try:
    redis_client: redis_lib.Redis | None = redis_lib.from_url(
        _redis_url,
        decode_responses=True,
        socket_connect_timeout=2,
    )
    redis_client.ping()
    logger.info("Redis cache connected: %s", _redis_url)
except Exception:
    redis_client = None
    logger.warning("Redis unavailable — caching disabled. Set REDIS_URL to enable.")


def make_cache_key(patient_query: str) -> str:
    """SHA256-based cache key for a patient query. Normalises before hashing."""
    digest = hashlib.sha256(patient_query.lower().strip().encode()).hexdigest()
    return f"trial_match:{digest}"


def cache_get(key: str) -> str | None:
    """Return the cached JSON string, or None if absent / Redis unavailable."""
    if redis_client is None:
        return None
    try:
        return redis_client.get(key)  # type: ignore[return-value]
    except Exception as exc:
        logger.warning("Cache GET failed (%s) — skipping.", exc)
        return None


def cache_set(key: str, value: str) -> None:
    """Store a JSON string in Redis with the standard TTL. Silent on failure."""
    if redis_client is None:
        return
    try:
        redis_client.setex(key, _CACHE_TTL, value)
    except Exception as exc:
        logger.warning("Cache SET failed (%s) — skipping.", exc)


def cache_flush() -> None:
    """Flush all cached match results. Called after new trial ingestion."""
    if redis_client is None:
        return
    try:
        redis_client.flushdb()
        logger.info("Redis cache flushed.")
    except Exception as exc:
        logger.warning("Cache flush failed (%s).", exc)


# ── Multi-LLM factory ────────────────────────────────────────────────────────

_llm_cache: dict[tuple[str, str], BaseChatModel] = {}


def _create_llm(provider: str, model: str) -> BaseChatModel:
    """Instantiate an LLM for the given provider + model string."""
    if provider == "openai":
        from langchain_openai import ChatOpenAI  # optional dep — lazy import
        return ChatOpenAI(model=model, temperature=0)
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic  # optional dep — lazy import
        return ChatAnthropic(model=model, temperature=0)  # type: ignore[return-value]
    # Default: Ollama (local)
    return ChatOllama(
        model=model,
        temperature=0,
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    )


def get_llm(provider: str | None = None, model: str | None = None) -> BaseChatModel:
    """Return a cached LLM instance for the given provider + model.

    Falls back to LLM_PROVIDER / LLM_MODEL env vars, then ollama / llama3.
    Instances are cached by (provider, model) so repeated calls are cheap.
    """
    _provider = (provider or os.getenv("LLM_PROVIDER", "ollama")).lower()
    _model = model or os.getenv("LLM_MODEL", "llama3")
    cache_key = (_provider, _model)
    if cache_key not in _llm_cache:
        logger.info("Initialising LLM: provider=%s model=%s", _provider, _model)
        _llm_cache[cache_key] = _create_llm(_provider, _model)
    return _llm_cache[cache_key]


# ── Reverse-match LLM chain ───────────────────────────────────────────────────

_reverse_llm = ChatOllama(
    model="llama3",
    temperature=0.3,
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
)

_reverse_prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are a clinical coordinator helping to recruit patients for clinical trials.
Given a trial's structured details, write a concise natural-language description
of the ideal patient who would qualify for this trial.
Be specific about age range, target conditions, medications used, and what disqualifies a patient.
Write exactly 2-3 sentences. Use plain prose — no bullet points, no headers.""",
        ),
        (
            "human",
            """Trial: {trial_title}

Conditions treated: {conditions_treated}
Medications / Interventions: {medications_used}
Age range: {age_range}
Excluded conditions: {conditions_excluded}
Excluded medications: {medications_excluded}

Describe the ideal patient profile in 2-3 sentences.""",
        ),
    ]
)

reverse_chain = _reverse_prompt | _reverse_llm
eligibility_chain = ChatOllama(model="llama3", temperature=0)
