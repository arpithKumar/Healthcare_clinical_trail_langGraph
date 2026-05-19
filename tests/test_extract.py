"""
Tests for src/extract.py — focuses on assess_extraction_confidence(),
which decides whether a trial goes to the graph or the pending review queue.
extract_trial_data() is excluded because it is a thin LLM chain call
that is already exercised through seed and ingest integration tests.
"""

from unittest.mock import MagicMock, patch

from src.extract import CONFIDENCE_THRESHOLD, assess_extraction_confidence
from src.schema import ExtractedEntities


def _minimal_entities() -> ExtractedEntities:
    """Minimal valid ExtractedEntities for use in confidence tests."""
    return ExtractedEntities(trial_title="Test Trial")


def _mock_response(content: str) -> MagicMock:
    m = MagicMock()
    m.content = content
    return m


# ── Threshold constant ────────────────────────────────────────────────────────


class TestConfidenceThreshold:
    def test_threshold_is_0_6(self):
        assert CONFIDENCE_THRESHOLD == 0.6


# ── assess_extraction_confidence ─────────────────────────────────────────────


class TestAssessExtractionConfidence:
    def test_returns_float_for_clean_decimal(self):
        with patch("src.extract.llm.invoke", return_value=_mock_response("0.85")):
            result = assess_extraction_confidence("some text", _minimal_entities())
        assert result == 0.85

    def test_extracts_decimal_from_surrounding_prose(self):
        with patch(
            "src.extract.llm.invoke",
            return_value=_mock_response(
                "The extraction quality is 0.72 out of 1.0."
            ),
        ):
            result = assess_extraction_confidence("some text", _minimal_entities())
        assert result == 0.72

    def test_returns_1_0_for_perfect_score(self):
        with patch("src.extract.llm.invoke", return_value=_mock_response("1.0")):
            result = assess_extraction_confidence("some text", _minimal_entities())
        assert result == 1.0

    def test_returns_0_0_for_zero_score(self):
        with patch("src.extract.llm.invoke", return_value=_mock_response("0")):
            result = assess_extraction_confidence("some text", _minimal_entities())
        assert result == 0.0

    def test_returns_1_0_for_integer_one(self):
        with patch("src.extract.llm.invoke", return_value=_mock_response("1")):
            result = assess_extraction_confidence("some text", _minimal_entities())
        assert result == 1.0

    def test_returns_1_0_when_no_number_in_response(self):
        """No regex match → falls through to the default return 1.0."""
        with patch(
            "src.extract.llm.invoke",
            return_value=_mock_response("I cannot assess this extraction."),
        ):
            result = assess_extraction_confidence("some text", _minimal_entities())
        assert result == 1.0

    def test_returns_1_0_on_llm_exception(self):
        """LLM call raises → ingestion must never be blocked; default 1.0 returned."""
        with patch("src.extract.llm.invoke", side_effect=Exception("Ollama timeout")):
            result = assess_extraction_confidence("some text", _minimal_entities())
        assert result == 1.0

    def test_result_is_never_above_1_0(self):
        with patch("src.extract.llm.invoke", return_value=_mock_response("1.000")):
            result = assess_extraction_confidence("some text", _minimal_entities())
        assert result <= 1.0

    def test_result_is_never_below_0_0(self):
        # "0" is the lowest matchable token; result should clamp to 0.0
        with patch("src.extract.llm.invoke", return_value=_mock_response("0")):
            result = assess_extraction_confidence("some text", _minimal_entities())
        assert result >= 0.0

    def test_truncates_text_to_800_characters_in_prompt(self):
        """The prompt must only include the first 800 chars of the source text."""
        long_text = "x" * 2000
        captured: dict = {}

        def capture_invoke(prompt_text: str) -> MagicMock:
            captured["prompt"] = prompt_text
            return _mock_response("0.9")

        with patch("src.extract.llm.invoke", side_effect=capture_invoke):
            assess_extraction_confidence(long_text, _minimal_entities())

        assert "x" * 800 in captured["prompt"]
        # The 801st character must not appear
        assert "x" * 801 not in captured["prompt"]

    def test_response_without_content_attr_uses_str_fallback(self):
        """If the response object has no .content, str(response) is used instead."""
        # A plain string has no .content attribute — exercises the `else str(response)` branch
        with patch("src.extract.llm.invoke", return_value="0.65"):
            result = assess_extraction_confidence("some text", _minimal_entities())
        assert result == 0.65

    def test_below_threshold_score_would_trigger_pending_review(self):
        """Verify a low score sits below CONFIDENCE_THRESHOLD (business rule check)."""
        with patch("src.extract.llm.invoke", return_value=_mock_response("0.45")):
            result = assess_extraction_confidence("some text", _minimal_entities())
        assert result < CONFIDENCE_THRESHOLD

    def test_above_threshold_score_would_allow_ingestion(self):
        """Verify a high score sits above CONFIDENCE_THRESHOLD (business rule check)."""
        with patch("src.extract.llm.invoke", return_value=_mock_response("0.85")):
            result = assess_extraction_confidence("some text", _minimal_entities())
        assert result >= CONFIDENCE_THRESHOLD
