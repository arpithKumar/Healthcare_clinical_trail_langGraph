"""
Stub heavy external dependencies before any test module is collected.

pytest loads conftest.py first, so every `from src.*` import in test files
gets MagicMock stand-ins for packages that may not be installed in the test
environment (neo4j, requests, langchain, langgraph, redis, etc.).

The per-test `with patch(...)` calls in individual files still work — they
layer on top of these stubs to provide test-specific return values.
"""

import sys
from unittest.mock import MagicMock

_STUB_MODULES = [
    # Neo4j driver
    "neo4j",
    "neo4j.time",
    "neo4j.graph",
    # HTTP
    "requests",
    # LangChain / Ollama
    "langchain_ollama",
    "langchain_community",
    "langchain_community.chat_models",
    "langchain_core",
    "langchain_core.prompts",
    "langchain_core.output_parsers",
    "langchain_core.messages",
    "langchain",
    "langchain.prompts",
    # LangGraph
    "langgraph",
    "langgraph.graph",
    # Redis
    "redis",
    # python-multipart (required by FastAPI File/Form endpoints at registration time)
    # Newer FastAPI checks both package name variants
    "multipart",
    "multipart.multipart",
    "python_multipart",
    "python_multipart.multipart",
]

# FastAPI 0.136+ raises RuntimeError at route-registration time when
# python-multipart is missing.  Neutralise the check so tests can import
# the app without the package being installed.
try:
    import fastapi.dependencies.utils as _fdu
    _fdu.ensure_multipart_is_installed = lambda: None  # type: ignore[attr-defined]
except Exception:
    pass

for _mod in _STUB_MODULES:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

# ── Redis stub: make cache_get always return None (cache miss) ────────────────
# If we leave redis as a plain MagicMock, redis_client.get() returns a
# MagicMock.  The router then calls json.loads(MagicMock()) → TypeError.
# Configure the mock so every .get() call returns None instead.
_mock_redis_client = MagicMock()
_mock_redis_client.get.return_value = None
sys.modules["redis"] = MagicMock(
    from_url=MagicMock(return_value=_mock_redis_client),
    RedisError=Exception,
)
