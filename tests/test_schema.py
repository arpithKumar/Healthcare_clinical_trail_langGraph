import pytest
from pydantic import ValidationError
from src.schema import Condition, Medication, TrialEligibility, ExtractedEntities


class TestCondition:
    def test_name_normalized_to_lowercase(self):
        c = Condition(name="Type 2 Diabetes")
        assert c.name == "type 2 diabetes"

    def test_name_strips_whitespace(self):
        c = Condition(name="  Hypertension  ")
        assert c.name == "hypertension"

    def test_empty_name_raises(self):
        with pytest.raises(ValidationError):
            Condition(name="   ")


class TestMedication:
    def test_name_normalized_to_lowercase(self):
        m = Medication(name="Metformin")
        assert m.name == "metformin"

    def test_empty_name_raises(self):
        with pytest.raises(ValidationError):
            Medication(name="")


class TestTrialEligibility:
    def test_valid_age_range(self):
        t = TrialEligibility(min_age=18, max_age=65)
        assert t.min_age == 18
        assert t.max_age == 65

    def test_equal_ages_allowed(self):
        t = TrialEligibility(min_age=18, max_age=18)
        assert t.min_age == 18

    def test_inverted_age_range_raises(self):
        with pytest.raises(ValidationError, match="min_age"):
            TrialEligibility(min_age=70, max_age=18)

    def test_gender_normalized_male(self):
        assert TrialEligibility(gender="male").gender == "Male"
        assert TrialEligibility(gender="M").gender == "Male"

    def test_gender_normalized_female(self):
        assert TrialEligibility(gender="FEMALE").gender == "Female"
        assert TrialEligibility(gender="f").gender == "Female"

    def test_gender_normalized_all(self):
        assert TrialEligibility(gender="both").gender == "All"
        assert TrialEligibility(gender="any").gender == "All"
        assert TrialEligibility(gender="ALL").gender == "All"

    def test_invalid_gender_raises(self):
        with pytest.raises(ValidationError, match="Unrecognized gender"):
            TrialEligibility(gender="unknown")

    def test_all_fields_optional(self):
        t = TrialEligibility()
        assert t.min_age is None
        assert t.max_age is None
        assert t.gender is None

    def test_negative_age_raises(self):
        with pytest.raises(ValidationError):
            TrialEligibility(min_age=-1)


class TestExtractedEntities:
    def test_full_valid_entity(self):
        entity = ExtractedEntities(
            trial_title="Phase 3 Metformin Trial",
            conditions_treated=[Condition(name="Type 2 Diabetes")],
            medications_used=[Medication(name="Metformin")],
            conditions_excluded=[Condition(name="Kidney Disease")],
            medications_excluded=[Medication(name="Insulin")],
            eligibility=TrialEligibility(min_age=18, max_age=65, gender="All"),
        )
        assert entity.trial_title == "Phase 3 Metformin Trial"
        assert entity.conditions_treated[0].name == "type 2 diabetes"
        assert entity.medications_used[0].name == "metformin"
        assert entity.eligibility.min_age == 18

    def test_empty_title_raises(self):
        with pytest.raises(ValidationError, match="trial_title"):
            ExtractedEntities(trial_title="   ")

    def test_lists_default_to_empty(self):
        entity = ExtractedEntities(trial_title="Minimal Trial")
        assert entity.conditions_treated == []
        assert entity.medications_used == []
        assert entity.conditions_excluded == []
        assert entity.medications_excluded == []

    def test_eligibility_defaults_to_empty(self):
        entity = ExtractedEntities(trial_title="Minimal Trial")
        assert entity.eligibility.min_age is None
        assert entity.eligibility.gender is None
