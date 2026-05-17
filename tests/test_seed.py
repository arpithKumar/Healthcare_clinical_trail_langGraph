import pytest
from unittest.mock import patch, MagicMock
from src.seed import ClinicalTrialsGovSource, TrialRecord, _process_trial


def _make_study(
    nct_id="NCT001",
    title="Test Trial",
    conditions=None,
    interventions=None,
    min_age="18 Years",
    max_age="65 Years",
    gender="ALL",
    criteria="Inclusion: adults. Exclusion: pregnant women.",
    description="A test trial.",
):
    return {
        "protocolSection": {
            "identificationModule": {"nctId": nct_id, "officialTitle": title},
            "conditionsModule": {"conditions": conditions or ["Diabetes"]},
            "armsInterventionsModule": {
                "interventions": interventions
                or [{"type": "DRUG", "name": "Metformin"}]
            },
            "eligibilityModule": {
                "minimumAge": min_age,
                "maximumAge": max_age,
                "sex": gender,
                "eligibilityCriteria": criteria,
            },
            "descriptionModule": {"detailedDescription": description},
        }
    }


class TestClinicalTrialsGovSource:
    def test_parses_valid_study(self):
        study = _make_study()
        record = ClinicalTrialsGovSource._parse_study(study)
        assert record is not None
        assert record.trial_id == "NCT001"
        assert record.title == "Test Trial"
        assert "Diabetes" in record.description
        assert "Metformin" in record.description
        assert "18 Years" in record.description

    def test_skips_study_with_no_text(self):
        study = _make_study(criteria="", description="")
        record = ClinicalTrialsGovSource._parse_study(study)
        assert record is None

    def test_filters_non_drug_interventions(self):
        study = _make_study(
            interventions=[
                {"type": "DRUG", "name": "Metformin"},
                {"type": "PROCEDURE", "name": "Surgery"},
                {"type": "DEVICE", "name": "Pump"},
            ]
        )
        record = ClinicalTrialsGovSource._parse_study(study)
        assert record is not None
        assert "Metformin" in record.description
        assert "Surgery" not in record.description
        assert "Pump" not in record.description

    def test_fetch_makes_correct_api_call(self):
        mock_response = MagicMock()
        mock_response.json.return_value = {"studies": [_make_study()]}

        with patch("src.seed.requests.get", return_value=mock_response):
            source = ClinicalTrialsGovSource()
            records = source.fetch(limit=5)

        assert len(records) == 1
        assert records[0].trial_id == "NCT001"

    def test_fetch_raises_on_http_error(self):
        with patch("src.seed.requests.get") as mock_get:
            mock_get.return_value.raise_for_status.side_effect = Exception("503")
            with pytest.raises(Exception, match="503"):
                ClinicalTrialsGovSource().fetch(limit=5)


class TestProcessTrial:
    def test_returns_success_on_valid_extraction(self):
        from src.schema import ExtractedEntities

        record = TrialRecord(
            trial_id="NCT001",
            title="Test Trial",
            description="Some description text.",
            phase="PHASE3",
            status="RECRUITING",
        )
        mock_gm = MagicMock()
        mock_extracted = MagicMock(spec=ExtractedEntities)
        mock_extracted.conditions_treated = []
        mock_extracted.conditions_excluded = []

        with patch("src.seed.extract_trial_data", return_value=mock_extracted):
            trial_id, success, message = _process_trial(record, mock_gm)

        assert trial_id == "NCT001"
        assert success is True
        assert message == "OK"
        mock_gm.ingest_trial.assert_called_once_with(
            trial_id="NCT001",
            extracted_data=mock_extracted,
            phase="PHASE3",
            status="RECRUITING",
        )

    def test_returns_failure_on_extraction_error(self):
        record = TrialRecord("NCT002", "Bad Trial", "text")
        mock_gm = MagicMock()

        with patch("src.seed.extract_trial_data", side_effect=ValueError("LLM failed")):
            trial_id, success, message = _process_trial(record, mock_gm)

        assert trial_id == "NCT002"
        assert success is False
        assert "LLM failed" in message


class TestParseStudyPhaseStatus:
    def test_extracts_phase_from_design_module(self):
        study = _make_study()
        study["protocolSection"]["designModule"] = {"phases": ["PHASE3"]}
        record = ClinicalTrialsGovSource._parse_study(study)
        assert record is not None
        assert record.phase == "PHASE3"

    def test_takes_first_phase_when_multiple_listed(self):
        study = _make_study()
        study["protocolSection"]["designModule"] = {"phases": ["PHASE2", "PHASE3"]}
        record = ClinicalTrialsGovSource._parse_study(study)
        assert record is not None
        assert record.phase == "PHASE2"

    def test_phase_is_none_when_design_module_absent(self):
        study = _make_study()
        record = ClinicalTrialsGovSource._parse_study(study)
        assert record is not None
        assert record.phase is None

    def test_phase_is_none_when_phases_list_is_empty(self):
        study = _make_study()
        study["protocolSection"]["designModule"] = {"phases": []}
        record = ClinicalTrialsGovSource._parse_study(study)
        assert record is not None
        assert record.phase is None

    def test_extracts_status_from_status_module(self):
        study = _make_study()
        study["protocolSection"]["statusModule"] = {"overallStatus": "RECRUITING"}
        record = ClinicalTrialsGovSource._parse_study(study)
        assert record is not None
        assert record.status == "RECRUITING"

    def test_status_is_none_when_status_module_absent(self):
        study = _make_study()
        record = ClinicalTrialsGovSource._parse_study(study)
        assert record is not None
        assert record.status is None

    def test_phase_and_status_both_extracted(self):
        study = _make_study()
        study["protocolSection"]["designModule"] = {"phases": ["PHASE3"]}
        study["protocolSection"]["statusModule"] = {
            "overallStatus": "ACTIVE_NOT_RECRUITING"
        }
        record = ClinicalTrialsGovSource._parse_study(study)
        assert record is not None
        assert record.phase == "PHASE3"
        assert record.status == "ACTIVE_NOT_RECRUITING"
