from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional


class Condition(BaseModel):
    name: str = Field(description="The name of the medical condition or disease.")
    icd10_code: str | None = Field(
        default=None,
        description="ICD-10-CM code (e.g. 'E11.9'). Populated post-extraction.",
    )

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Condition name must not be empty.")
        return v.lower()


class Medication(BaseModel):
    name: str = Field(description="The name of the drug or medication.")

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Medication name must not be empty.")
        return v.lower()


class TrialEligibility(BaseModel):
    min_age: Optional[int] = Field(
        default=None, ge=0, description="Minimum age required for the trial."
    )
    max_age: Optional[int] = Field(
        default=None, ge=0, description="Maximum age allowed for the trial."
    )
    gender: Optional[str] = Field(
        default=None, description="Gender requirement: 'All', 'Male', or 'Female'."
    )

    @field_validator("gender")
    @classmethod
    def normalize_gender(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        mapping = {
            "male": "Male",
            "m": "Male",
            "female": "Female",
            "f": "Female",
            "all": "All",
            "both": "All",
            "any": "All",
        }
        normalized = mapping.get(v.strip().lower())
        if normalized is None:
            raise ValueError(
                f"Unrecognized gender value: '{v}'. Expected Male, Female, or All."
            )
        return normalized

    @model_validator(mode="after")
    def validate_age_range(self) -> "TrialEligibility":
        if self.min_age is not None and self.max_age is not None:
            if self.min_age > self.max_age:
                raise ValueError(
                    f"min_age ({self.min_age}) must not be greater than max_age ({self.max_age})."
                )
        return self


class ExtractedEntities(BaseModel):
    trial_title: str = Field(description="The official title of the clinical trial.")
    conditions_treated: List[Condition] = Field(default_factory=list)
    medications_used: List[Medication] = Field(default_factory=list)
    conditions_excluded: List[Condition] = Field(default_factory=list)
    medications_excluded: List[Medication] = Field(default_factory=list)
    eligibility: TrialEligibility = Field(default_factory=lambda: TrialEligibility())

    @field_validator("trial_title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("trial_title must not be empty.")
        return v


class ScoredTrial(BaseModel):
    """A matched trial with an LLM-generated relevance score."""

    trial_id: str
    trial_title: str
    score: int = Field(ge=0, le=100, description="Match score 0-100.")
    reasons: List[str] = Field(
        default_factory=list, description="Why this trial matches."
    )
    concerns: List[str] = Field(
        default_factory=list, description="Potential exclusions or caveats."
    )
