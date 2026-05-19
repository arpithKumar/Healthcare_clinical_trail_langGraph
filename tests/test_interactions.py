from unittest.mock import patch, MagicMock

# Suppress heavy dependencies during import
# Note: src.agent.ChatOllama was removed in Feature P (Multi-LLM Support).
# The agent now calls get_llm() from src.dependencies — patch there instead.
with patch("src.graph.GraphDatabase.driver"), patch("src.agent._get_driver"), patch(
    "src.extract.ChatOllama"
), patch("src.dependencies.ChatOllama"):
    from src.interactions import (
        _get_interaction_text,
        warnings_for_trial,
        check_interactions,
    )
    from src.routers.patients import _extract_patient_meds


class TestGetInteractionText:
    def test_returns_lowercased_text_on_success(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "results": [{"drug_interactions": ["Do not use with Aspirin."]}]
        }
        with patch("src.interactions.requests.get", return_value=mock_resp):
            result = _get_interaction_text("warfarin")
        assert "aspirin" in result
        assert result == result.lower()

    def test_returns_empty_string_on_404(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        with patch("src.interactions.requests.get", return_value=mock_resp):
            result = _get_interaction_text("unknownmed")
        assert result == ""

    def test_returns_empty_string_on_request_exception(self):
        with patch(
            "src.interactions.requests.get",
            side_effect=Exception("Connection error"),
        ):
            result = _get_interaction_text("warfarin")
        assert result == ""

    def test_returns_empty_string_when_results_list_is_empty(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"results": []}
        with patch("src.interactions.requests.get", return_value=mock_resp):
            result = _get_interaction_text("warfarin")
        assert result == ""

    def test_returns_empty_string_when_drug_interactions_field_absent(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"results": [{"indications": "For pain."}]}
        with patch("src.interactions.requests.get", return_value=mock_resp):
            result = _get_interaction_text("ibuprofen")
        assert result == ""

    def test_joins_list_drug_interactions_field(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "results": [
                {
                    "drug_interactions": [
                        "May increase bleeding with aspirin.",
                        "Avoid ibuprofen.",
                    ]
                }
            ]
        }
        with patch("src.interactions.requests.get", return_value=mock_resp):
            result = _get_interaction_text("warfarin")
        assert "aspirin" in result
        assert "ibuprofen" in result


class TestWarningsForTrial:
    def test_returns_warning_when_trial_med_in_interaction_text(self):
        texts = {"warfarin": "do not use with aspirin due to bleeding risk."}
        warnings = warnings_for_trial(texts, ["aspirin"])
        assert len(warnings) == 1
        assert "warfarin" in warnings[0].lower()
        assert "aspirin" in warnings[0].lower()

    def test_returns_empty_when_no_match(self):
        texts = {"warfarin": "avoid grapefruit juice."}
        warnings = warnings_for_trial(texts, ["metformin"])
        assert warnings == []

    def test_returns_empty_when_interaction_text_is_empty(self):
        texts = {"metformin": ""}
        warnings = warnings_for_trial(texts, ["aspirin"])
        assert warnings == []

    def test_returns_empty_when_trial_meds_list_is_empty(self):
        texts = {"warfarin": "avoid aspirin"}
        warnings = warnings_for_trial(texts, [])
        assert warnings == []

    def test_returns_empty_when_interaction_texts_dict_is_empty(self):
        warnings = warnings_for_trial({}, ["aspirin"])
        assert warnings == []

    def test_multiple_conflicting_pairs_all_reported(self):
        texts = {
            "warfarin": "do not combine with aspirin or ibuprofen",
        }
        warnings = warnings_for_trial(texts, ["aspirin", "ibuprofen"])
        trial_meds_in_warnings = [w.lower() for w in warnings]
        assert any("aspirin" in w for w in trial_meds_in_warnings)
        assert any("ibuprofen" in w for w in trial_meds_in_warnings)
        assert len(warnings) == 2

    def test_case_insensitive_matching(self):
        texts = {"warfarin": "ASPIRIN should be avoided."}
        # text is lowercased by _get_interaction_text; simulate that here
        texts = {"warfarin": "aspirin should be avoided."}
        warnings = warnings_for_trial(texts, ["Aspirin"])
        # trial med "Aspirin".lower() == "aspirin" which is in text
        assert len(warnings) == 1


class TestCheckInteractions:
    def test_returns_empty_when_patient_meds_is_empty(self):
        result = check_interactions([], ["aspirin"])
        assert result == []

    def test_returns_empty_when_trial_meds_is_empty(self):
        result = check_interactions(["warfarin"], [])
        assert result == []

    def test_returns_warnings_when_match_found(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "results": [{"drug_interactions": ["avoid aspirin"]}]
        }
        with patch("src.interactions.requests.get", return_value=mock_resp):
            warnings = check_interactions(["warfarin"], ["aspirin"])
        assert len(warnings) == 1

    def test_never_raises_on_api_failure(self):
        with patch(
            "src.interactions.requests.get",
            side_effect=Exception("Network error"),
        ):
            result = check_interactions(["warfarin"], ["aspirin"])
        assert result == []

    def test_returns_empty_when_no_interaction_found(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "results": [{"drug_interactions": ["avoid alcohol"]}]
        }
        with patch("src.interactions.requests.get", return_value=mock_resp):
            result = check_interactions(["metformin"], ["aspirin"])
        assert result == []


class TestExtractPatientMeds:
    def test_parses_single_medication(self):
        profile = "Age: 55\nGender: Male\nConditions: diabetes\nMedications: metformin"
        assert _extract_patient_meds(profile) == ["metformin"]

    def test_parses_multiple_comma_separated_medications(self):
        profile = "Medications: metformin, insulin, aspirin"
        assert _extract_patient_meds(profile) == ["metformin", "insulin", "aspirin"]

    def test_lowercases_medication_names(self):
        profile = "Medications: Metformin, Warfarin"
        assert _extract_patient_meds(profile) == ["metformin", "warfarin"]

    def test_returns_empty_for_none_value(self):
        assert _extract_patient_meds("Medications: none") == []

    def test_returns_empty_for_unknown_value(self):
        assert _extract_patient_meds("Medications: unknown") == []

    def test_returns_empty_for_not_specified_value(self):
        assert _extract_patient_meds("Medications: not specified") == []

    def test_returns_empty_when_medications_line_absent(self):
        assert _extract_patient_meds("Age: 55\nConditions: diabetes") == []

    def test_returns_empty_for_empty_string(self):
        assert _extract_patient_meds("") == []

    def test_case_insensitive_medications_label(self):
        profile = "MEDICATIONS: warfarin"
        assert _extract_patient_meds(profile) == ["warfarin"]
