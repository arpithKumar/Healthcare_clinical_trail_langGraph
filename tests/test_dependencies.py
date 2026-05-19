"""
Tests for src/dependencies.py — covers the get_llm() factory (Feature P),
the (provider, model) cache, and the Redis cache helpers.

The module-level singletons (GraphManager, WatchlistManager, redis_client)
are already stubbed by conftest.py; these tests focus only on the logic
that was added for multi-LLM support and caching.
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

import src.dependencies as deps


@pytest.fixture(autouse=True)
def clear_llm_cache():
    """Isolate each test: clear the module-level LLM instance cache before and after."""
    deps._llm_cache.clear()
    yield
    deps._llm_cache.clear()


# ── make_cache_key ────────────────────────────────────────────────────────────


class TestMakeCacheKey:
    def test_returns_string_with_prefix(self):
        key = deps.make_cache_key("55yo male with diabetes")
        assert key.startswith("trial_match:")

    def test_same_query_returns_same_key(self):
        assert deps.make_cache_key("test query") == deps.make_cache_key("test query")

    def test_whitespace_stripped_before_hashing(self):
        assert deps.make_cache_key("  diabetes  ") == deps.make_cache_key("diabetes")

    def test_lowercased_before_hashing(self):
        assert deps.make_cache_key("DIABETES") == deps.make_cache_key("diabetes")

    def test_different_queries_produce_different_keys(self):
        assert deps.make_cache_key("diabetes") != deps.make_cache_key("hypertension")

    def test_key_is_deterministic_across_calls(self):
        k1 = deps.make_cache_key("55yo female")
        k2 = deps.make_cache_key("55yo female")
        k3 = deps.make_cache_key("55yo female")
        assert k1 == k2 == k3


# ── Cache helpers: Redis unavailable ─────────────────────────────────────────


class TestCacheHelpersWithNoRedis:
    def test_cache_get_returns_none_when_redis_unavailable(self):
        with patch.object(deps, "redis_client", None):
            assert deps.cache_get("any-key") is None

    def test_cache_set_is_noop_when_redis_unavailable(self):
        with patch.object(deps, "redis_client", None):
            deps.cache_set("any-key", '{"result": 1}')  # must not raise

    def test_cache_flush_is_noop_when_redis_unavailable(self):
        with patch.object(deps, "redis_client", None):
            deps.cache_flush()  # must not raise


# ── Cache helpers: Redis available ───────────────────────────────────────────


class TestCacheHelpersWithRedis:
    def test_cache_get_returns_value_from_redis(self):
        mock_redis = MagicMock()
        mock_redis.get.return_value = '{"result": "cached"}'
        with patch.object(deps, "redis_client", mock_redis):
            result = deps.cache_get("some-key")
        assert result == '{"result": "cached"}'
        mock_redis.get.assert_called_once_with("some-key")

    def test_cache_set_calls_setex_with_correct_ttl(self):
        mock_redis = MagicMock()
        with patch.object(deps, "redis_client", mock_redis):
            deps.cache_set("some-key", '{"data": 1}')
        mock_redis.setex.assert_called_once_with("some-key", 3600, '{"data": 1}')

    def test_cache_flush_calls_flushdb(self):
        mock_redis = MagicMock()
        with patch.object(deps, "redis_client", mock_redis):
            deps.cache_flush()
        mock_redis.flushdb.assert_called_once()

    def test_cache_get_returns_none_on_redis_error(self):
        mock_redis = MagicMock()
        mock_redis.get.side_effect = Exception("Redis connection error")
        with patch.object(deps, "redis_client", mock_redis):
            result = deps.cache_get("some-key")
        assert result is None

    def test_cache_set_is_silent_on_redis_error(self):
        mock_redis = MagicMock()
        mock_redis.setex.side_effect = Exception("Redis write error")
        with patch.object(deps, "redis_client", mock_redis):
            deps.cache_set("some-key", "value")  # must not raise

    def test_cache_flush_is_silent_on_redis_error(self):
        mock_redis = MagicMock()
        mock_redis.flushdb.side_effect = Exception("Redis flush error")
        with patch.object(deps, "redis_client", mock_redis):
            deps.cache_flush()  # must not raise


# ── get_llm factory ───────────────────────────────────────────────────────────


class TestGetLlm:
    def test_returns_instance_for_default_ollama(self):
        instance = deps.get_llm()
        assert instance is not None

    def test_same_provider_and_model_returns_same_instance(self):
        a = deps.get_llm("ollama", "llama3")
        b = deps.get_llm("ollama", "llama3")
        assert a is b

    def test_different_models_return_different_instances(self):
        # ChatOllama is a MagicMock whose return_value is always the same object.
        # Patch _create_llm to return a fresh MagicMock per call so we can assert
        # that the cache correctly stores separate instances for separate model keys.
        with patch("src.dependencies._create_llm", side_effect=lambda p, m: MagicMock()):
            a = deps.get_llm("ollama", "llama3")
            b = deps.get_llm("ollama", "mistral")
        assert a is not b

    def test_instance_is_not_recreated_on_second_call(self):
        """_create_llm must only be called once per (provider, model) pair."""
        deps.get_llm("ollama", "llama3")  # populate cache
        with patch("src.dependencies._create_llm") as mock_create:
            deps.get_llm("ollama", "llama3")
        mock_create.assert_not_called()

    def test_provider_is_lowercased_before_cache_lookup(self):
        deps.get_llm("OLLAMA", "llama3")
        assert ("ollama", "llama3") in deps._llm_cache

    def test_uses_env_var_provider_when_no_arg_given(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "ollama", "LLM_MODEL": "mistral"}):
            deps.get_llm()
        assert ("ollama", "mistral") in deps._llm_cache

    def test_explicit_arg_overrides_env_var_provider(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "ollama", "LLM_MODEL": "llama3"}):
            deps.get_llm("ollama", "gemma2")
        assert ("ollama", "gemma2") in deps._llm_cache

    def test_defaults_to_ollama_llama3_when_no_env_vars(self):
        env = {k: v for k, v in os.environ.items() if k not in ("LLM_PROVIDER", "LLM_MODEL")}
        with patch.dict(os.environ, env, clear=True):
            deps.get_llm()
        assert ("ollama", "llama3") in deps._llm_cache


# ── _create_llm provider branching ───────────────────────────────────────────


class TestCreateLlm:
    def test_openai_provider_instantiates_chat_openai(self):
        fake_openai_mod = MagicMock()
        mock_instance = MagicMock()
        fake_openai_mod.ChatOpenAI.return_value = mock_instance
        with patch.dict(sys.modules, {"langchain_openai": fake_openai_mod}):
            result = deps._create_llm("openai", "gpt-4o")
        fake_openai_mod.ChatOpenAI.assert_called_once_with(model="gpt-4o", temperature=0)
        assert result is mock_instance

    def test_anthropic_provider_instantiates_chat_anthropic(self):
        fake_anthropic_mod = MagicMock()
        mock_instance = MagicMock()
        fake_anthropic_mod.ChatAnthropic.return_value = mock_instance
        with patch.dict(sys.modules, {"langchain_anthropic": fake_anthropic_mod}):
            result = deps._create_llm("anthropic", "claude-opus-4-5")
        fake_anthropic_mod.ChatAnthropic.assert_called_once_with(
            model="claude-opus-4-5", temperature=0
        )
        assert result is mock_instance

    def test_unknown_provider_falls_back_to_ollama(self):
        """Any unrecognized provider string falls through to the ChatOllama branch."""
        result = deps._create_llm("unknown_provider", "llama3")
        assert result is not None

    def test_different_providers_produce_different_cache_entries(self):
        fake_openai_mod = MagicMock()
        fake_openai_mod.ChatOpenAI.return_value = MagicMock()
        with patch.dict(sys.modules, {"langchain_openai": fake_openai_mod}):
            ollama_instance = deps.get_llm("ollama", "llama3")
            openai_instance = deps.get_llm("openai", "gpt-4o")
        assert ollama_instance is not openai_instance
        assert len(deps._llm_cache) == 2
