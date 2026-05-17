from unittest.mock import MagicMock, patch
from src.agent import should_retry, GraphState, MAX_RETRIES


class TestShouldRetry:
    def test_retries_on_error_within_limit(self):
        state: GraphState = {
            "patient_query": "55yo male",
            "error_message": "Invalid Cypher syntax",
            "retry_count": 0,
        }
        assert should_retry(state) == "retry"

    def test_retries_up_to_max(self):
        state: GraphState = {
            "patient_query": "55yo male",
            "error_message": "DB error",
            "retry_count": MAX_RETRIES - 1,
        }
        assert should_retry(state) == "retry"

    def test_proceeds_when_retries_exhausted(self):
        state: GraphState = {
            "patient_query": "55yo male",
            "error_message": "still failing",
            "retry_count": MAX_RETRIES,
        }
        assert should_retry(state) == "proceed"

    def test_proceeds_when_no_error(self):
        state: GraphState = {
            "patient_query": "55yo male",
            "error_message": "",
            "retry_count": 0,
        }
        assert should_retry(state) == "proceed"

    def test_proceeds_when_error_message_absent(self):
        state: GraphState = {"patient_query": "55yo male"}
        assert should_retry(state) == "proceed"


class TestAnalyzeQueryNode:
    def test_returns_analyzed_profile_and_retry_count(self):
        with patch("src.agent.llm") as mock_llm:
            mock_llm.return_value = MagicMock()

            mock_response = MagicMock()
            mock_response.content = (
                "Age: 55\nGender: Male\nConditions: type 2 diabetes\nMedications: none"
            )

            with patch("src.agent.ChatPromptTemplate") as mock_prompt:
                mock_chain = MagicMock()
                mock_chain.invoke.return_value = mock_response
                mock_prompt.from_messages.return_value.__or__ = MagicMock(
                    return_value=mock_chain
                )

                from src.agent import analyze_query

                state: GraphState = {"patient_query": "55yo male with Type 2 Diabetes"}
                result = analyze_query(state)

                assert "analyzed_profile" in result
                assert "retry_count" in result
                assert result["retry_count"] == 0


class TestExecuteQueryNode:
    def test_returns_empty_results_and_error_on_db_failure(self):
        with patch("src.agent._get_driver") as mock_driver:
            mock_driver.return_value.session.side_effect = Exception(
                "Connection refused"
            )

            from src.agent import execute_query

            state: GraphState = {
                "patient_query": "55yo male",
                "cypher_query": "MATCH (t:Trial) RETURN t",
            }
            result = execute_query(state)

            assert result["db_results"] == []
            assert "Connection refused" in result["error_message"]
            assert result["retry_count"] == 1

    def test_increments_retry_count_on_failure(self):
        with patch("src.agent._get_driver") as mock_driver:
            mock_driver.return_value.session.side_effect = Exception("Timeout")

            from src.agent import execute_query

            state: GraphState = {
                "patient_query": "55yo male",
                "cypher_query": "MATCH (t:Trial) RETURN t",
                "retry_count": 1,
            }
            result = execute_query(state)
            assert result["retry_count"] == 2


class TestGenerateCypherFilters:
    def _make_mock_chain(
        self, content: str = "MATCH (t:Trial) RETURN t.id AS trial_id"
    ):
        """Helper: returns a patched ChatPromptTemplate and its mock invoke chain."""
        mock_chain = MagicMock()
        mock_chain.invoke.return_value = MagicMock(content=content)
        return mock_chain

    def test_prompt_does_not_contain_active_filters_when_none_set(self):
        with patch("src.agent.ChatPromptTemplate") as mock_prompt_cls:
            mock_chain = self._make_mock_chain()
            mock_prompt_cls.from_messages.return_value.__or__ = MagicMock(
                return_value=mock_chain
            )
            from src.agent import generate_cypher

            state: GraphState = {
                "patient_query": "55yo male",
                "analyzed_profile": "Age: 55\nConditions: diabetes",
            }
            generate_cypher(state)

        system_msg = mock_prompt_cls.from_messages.call_args[0][0][0][1]
        assert "ACTIVE FILTERS" not in system_msg

    def test_phase_filter_injects_active_filters_block(self):
        with patch("src.agent.ChatPromptTemplate") as mock_prompt_cls:
            mock_chain = self._make_mock_chain()
            mock_prompt_cls.from_messages.return_value.__or__ = MagicMock(
                return_value=mock_chain
            )
            from src.agent import generate_cypher

            state: GraphState = {
                "patient_query": "55yo male",
                "analyzed_profile": "Age: 55",
                "phase_filter": "PHASE3",
            }
            generate_cypher(state)

        system_msg = mock_prompt_cls.from_messages.call_args[0][0][0][1]
        assert "ACTIVE FILTERS" in system_msg
        assert "PHASE3" in system_msg

    def test_status_filter_injects_active_filters_block(self):
        with patch("src.agent.ChatPromptTemplate") as mock_prompt_cls:
            mock_chain = self._make_mock_chain()
            mock_prompt_cls.from_messages.return_value.__or__ = MagicMock(
                return_value=mock_chain
            )
            from src.agent import generate_cypher

            state: GraphState = {
                "patient_query": "55yo male",
                "analyzed_profile": "Age: 55",
                "status_filter": "RECRUITING",
            }
            generate_cypher(state)

        system_msg = mock_prompt_cls.from_messages.call_args[0][0][0][1]
        assert "ACTIVE FILTERS" in system_msg
        assert "RECRUITING" in system_msg

    def test_both_filters_appear_in_active_filters_block(self):
        with patch("src.agent.ChatPromptTemplate") as mock_prompt_cls:
            mock_chain = self._make_mock_chain()
            mock_prompt_cls.from_messages.return_value.__or__ = MagicMock(
                return_value=mock_chain
            )
            from src.agent import generate_cypher

            state: GraphState = {
                "patient_query": "55yo male",
                "phase_filter": "PHASE2",
                "status_filter": "RECRUITING",
            }
            generate_cypher(state)

        system_msg = mock_prompt_cls.from_messages.call_args[0][0][0][1]
        assert "PHASE2" in system_msg
        assert "RECRUITING" in system_msg

    def test_cypher_output_stripped_of_markdown_fences(self):
        with patch("src.agent.ChatPromptTemplate") as mock_prompt_cls:
            mock_chain = MagicMock()
            mock_chain.invoke.return_value = MagicMock(
                content="```cypher\nMATCH (t:Trial) RETURN t.id AS trial_id\n```"
            )
            mock_prompt_cls.from_messages.return_value.__or__ = MagicMock(
                return_value=mock_chain
            )
            from src.agent import generate_cypher

            state: GraphState = {"patient_query": "55yo male"}
            result = generate_cypher(state)

        assert "```" not in result["cypher_query"]
        assert "MATCH" in result["cypher_query"]
        assert result["error_message"] == ""

    def test_error_context_injected_on_retry(self):
        with patch("src.agent.ChatPromptTemplate") as mock_prompt_cls:
            mock_chain = self._make_mock_chain()
            mock_prompt_cls.from_messages.return_value.__or__ = MagicMock(
                return_value=mock_chain
            )
            from src.agent import generate_cypher

            state: GraphState = {
                "patient_query": "55yo male",
                "error_message": "SyntaxError: invalid Cypher",
                "retry_count": 1,
            }
            generate_cypher(state)

        system_msg = mock_prompt_cls.from_messages.call_args[0][0][0][1]
        assert "PREVIOUS ATTEMPT FAILED" in system_msg
        assert "SyntaxError: invalid Cypher" in system_msg
