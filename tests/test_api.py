from unittest.mock import patch
from fastapi.testclient import TestClient

# Patch heavy dependencies before importing the app
# Note: src.agent.ChatOllama was removed in Feature P (Multi-LLM Support).
# The agent now calls get_llm() from src.dependencies — patch there instead.
with patch("src.graph.GraphDatabase.driver"), patch("src.agent._get_driver"), patch(
    "src.extract.ChatOllama"
), patch("src.dependencies.ChatOllama"):
    from src.api import app

client = TestClient(app)


class TestHealthEndpoint:
    def test_returns_healthy(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


class TestMatchEndpoint:
    def test_successful_match(self):
        mock_state = {
            "cypher_query": "MATCH (t:Trial) RETURN t.id AS trial_id LIMIT 5",
            "final_verdict": "Patient matches 2 trials.",
            "db_results": [{"trial_id": "NCT001", "trial_title": "Test Trial"}],
            "scored_trials": [],
        }
        with patch("src.routers.patients.agent_app.invoke", return_value=mock_state):
            response = client.post(
                "/api/v1/patients/match",
                json={"profile": "55yo male with Type 2 Diabetes"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["patient_profile"] == "55yo male with Type 2 Diabetes"
        assert data["agent_verdict"] == "Patient matches 2 trials."
        assert len(data["trials"]) == 1

    def test_missing_profile_returns_422(self):
        response = client.post("/api/v1/patients/match", json={})
        assert response.status_code == 422

    def test_agent_failure_returns_500(self):
        with patch(
            "src.routers.patients.agent_app.invoke",
            side_effect=RuntimeError("LLM timeout"),
        ):
            response = client.post(
                "/api/v1/patients/match",
                json={"profile": "55yo male"},
            )
        assert response.status_code == 500
        assert "Agent execution failed" in response.json()["detail"]


class TestIngestEndpoint:
    def test_successful_ingestion(self):
        from src.schema import ExtractedEntities, TrialEligibility

        mock_extracted = ExtractedEntities(
            trial_title="Test Trial",
            eligibility=TrialEligibility(min_age=18, max_age=65, gender="All"),
        )
        with patch(
            "src.routers.trials.extract_trial_data", return_value=mock_extracted
        ), patch("src.routers.trials.graph_manager.ingest_trial"):
            response = client.post(
                "/api/v1/trials/ingest",
                json={
                    "trial_id": "NCT-TEST01",
                    "text": "A phase 3 trial for diabetes.",
                },
            )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["trial_id"] == "NCT-TEST01"
        assert "extracted_entities" in data

    def test_missing_text_returns_422(self):
        response = client.post("/api/v1/trials/ingest", json={"trial_id": "NCT001"})
        assert response.status_code == 422

    def test_extraction_failure_returns_500(self):
        with patch(
            "src.routers.trials.extract_trial_data",
            side_effect=ValueError("LLM error"),
        ):
            response = client.post(
                "/api/v1/trials/ingest",
                json={"text": "Some trial text"},
            )
        assert response.status_code == 500
        assert "Ingestion failed" in response.json()["detail"]


class TestMatchEndpointFilters:
    def test_phase_filter_is_passed_to_agent_state(self):
        mock_state = {
            "cypher_query": "MATCH (t:Trial) WHERE t.phase = 'PHASE3' RETURN t.id AS trial_id",
            "final_verdict": "Found with phase filter.",
            "db_results": [],
            "scored_trials": [],
            "analyzed_profile": "",
        }
        with patch(
            "src.routers.patients.agent_app.invoke", return_value=mock_state
        ) as mock_invoke, patch(
            "src.routers.patients._enrich_with_interactions",
            return_value=([], []),
        ):
            response = client.post(
                "/api/v1/patients/match?phase=PHASE3",
                json={"profile": "55yo male with diabetes"},
            )
        assert response.status_code == 200
        called_state = mock_invoke.call_args[0][0]
        assert called_state.get("phase_filter") == "PHASE3"
        assert "status_filter" not in called_state

    def test_status_filter_is_passed_to_agent_state(self):
        mock_state = {
            "cypher_query": "MATCH (t:Trial) WHERE t.status = 'RECRUITING' RETURN t.id AS trial_id",
            "final_verdict": "Found.",
            "db_results": [],
            "scored_trials": [],
            "analyzed_profile": "",
        }
        with patch(
            "src.routers.patients.agent_app.invoke", return_value=mock_state
        ) as mock_invoke, patch(
            "src.routers.patients._enrich_with_interactions",
            return_value=([], []),
        ):
            response = client.post(
                "/api/v1/patients/match?status=RECRUITING",
                json={"profile": "45yo female"},
            )
        assert response.status_code == 200
        called_state = mock_invoke.call_args[0][0]
        assert called_state.get("status_filter") == "RECRUITING"
        assert "phase_filter" not in called_state

    def test_both_filters_passed_together(self):
        mock_state = {
            "cypher_query": "MATCH ...",
            "final_verdict": "Done.",
            "db_results": [],
            "scored_trials": [],
            "analyzed_profile": "",
        }
        with patch(
            "src.routers.patients.agent_app.invoke", return_value=mock_state
        ) as mock_invoke, patch(
            "src.routers.patients._enrich_with_interactions",
            return_value=([], []),
        ):
            response = client.post(
                "/api/v1/patients/match?phase=PHASE2&status=RECRUITING",
                json={"profile": "30yo female"},
            )
        assert response.status_code == 200
        called_state = mock_invoke.call_args[0][0]
        assert called_state.get("phase_filter") == "PHASE2"
        assert called_state.get("status_filter") == "RECRUITING"

    def test_no_filter_keys_injected_when_params_absent(self):
        mock_state = {
            "cypher_query": "MATCH ...",
            "final_verdict": "Done.",
            "db_results": [],
            "scored_trials": [],
            "analyzed_profile": "",
        }
        with patch(
            "src.routers.patients.agent_app.invoke", return_value=mock_state
        ) as mock_invoke, patch(
            "src.routers.patients._enrich_with_interactions",
            return_value=([], []),
        ):
            response = client.post(
                "/api/v1/patients/match",
                json={"profile": "45yo female"},
            )
        assert response.status_code == 200
        called_state = mock_invoke.call_args[0][0]
        assert "phase_filter" not in called_state
        assert "status_filter" not in called_state


class TestMatchEndpointInteractions:
    def test_interaction_warnings_present_in_response(self):
        mock_state = {
            "cypher_query": "MATCH ...",
            "final_verdict": "Match found.",
            "db_results": [],
            "scored_trials": [{"trial_id": "NCT001", "trial_title": "T", "score": 80}],
            "analyzed_profile": "Medications: warfarin",
        }
        enriched = [
            {
                "trial_id": "NCT001",
                "trial_title": "T",
                "score": 80,
                "interaction_warnings": ["Warfarin may interact with Aspirin"],
            }
        ]
        with patch(
            "src.routers.patients.agent_app.invoke", return_value=mock_state
        ), patch(
            "src.routers.patients._enrich_with_interactions",
            return_value=(enriched, ["Warfarin may interact with Aspirin"]),
        ):
            response = client.post(
                "/api/v1/patients/match",
                json={"profile": "65yo male with atrial fibrillation on warfarin"},
            )
        assert response.status_code == 200
        data = response.json()
        assert "interaction_warnings" in data
        assert len(data["interaction_warnings"]) == 1
        assert data["scored_trials"][0]["interaction_warnings"] == [
            "Warfarin may interact with Aspirin"
        ]

    def test_interaction_warnings_empty_when_no_scored_trials(self):
        mock_state = {
            "cypher_query": "MATCH ...",
            "final_verdict": "No trials found.",
            "db_results": [],
            "scored_trials": [],
            "analyzed_profile": "Medications: metformin",
        }
        with patch(
            "src.routers.patients.agent_app.invoke", return_value=mock_state
        ), patch(
            "src.routers.patients._enrich_with_interactions",
            return_value=([], []),
        ):
            response = client.post(
                "/api/v1/patients/match",
                json={"profile": "55yo male"},
            )
        assert response.status_code == 200
        assert response.json()["interaction_warnings"] == []

    def test_enrich_with_interactions_called_with_correct_args(self):
        mock_state = {
            "cypher_query": "MATCH ...",
            "final_verdict": "Done.",
            "db_results": [],
            "scored_trials": [{"trial_id": "NCT002", "score": 70}],
            "analyzed_profile": "Age: 60\nMedications: warfarin",
        }
        with patch(
            "src.routers.patients.agent_app.invoke", return_value=mock_state
        ), patch(
            "src.routers.patients._enrich_with_interactions",
            return_value=(mock_state["scored_trials"], []),
        ) as mock_enrich:
            client.post(
                "/api/v1/patients/match",
                json={"profile": "60yo on warfarin"},
            )
        mock_enrich.assert_called_once_with(
            mock_state["scored_trials"],
            "Age: 60\nMedications: warfarin",
        )
