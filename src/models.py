import uuid

from pydantic import BaseModel, Field


# ── Requests ──────────────────────────────────────────────────────────────────


class PatientQuery(BaseModel):
    profile: str = Field(..., examples=["55yo male with Type 2 Diabetes."])


class FhirBundle(BaseModel):
    resourceType: str = Field(default="Bundle")
    entry: list[dict] = Field(default_factory=list)


class IngestionRequest(BaseModel):
    trial_id: str = Field(
        default_factory=lambda: f"NCT-{uuid.uuid4().hex[:6].upper()}",
    )
    text: str = Field(..., examples=["Phase 2 trial testing Ibuprofen for Headaches."])


class SaveProfileRequest(BaseModel):
    profile_text: str = Field(..., examples=["55yo male with Type 2 Diabetes."])


class UpdateNotesRequest(BaseModel):
    notes: str = Field(default="")


# ── Responses ─────────────────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    service: str


class MatchResponse(BaseModel):
    patient_profile: str
    executed_cypher: str | None
    agent_verdict: str | None
    trials: list[dict]
    scored_trials: list[dict]
    interaction_warnings: list[str] = Field(default_factory=list)


class IngestionResponse(BaseModel):
    status: str
    trial_id: str
    extracted_entities: dict


class SubgraphNode(BaseModel):
    id: str
    label: str
    type: str


class SubgraphLink(BaseModel):
    source: str
    target: str
    type: str


class SubgraphResponse(BaseModel):
    nodes: list[SubgraphNode]
    links: list[SubgraphLink]


class WatchlistProfileResponse(BaseModel):
    id: str
    profile_text: str
    created_at: str
    last_trial_ids: list[str]
    notes: str | None = Field(default=None)
    notes_updated_at: str | None = Field(default=None)


class WatchlistRunItemResponse(BaseModel):
    profile_id: str
    profile_text: str
    created_at: str
    total_matches: int
    new_matches: list[str]
    scored_trials: list[dict]
    error: str | None


class EligibleProfileResponse(BaseModel):
    trial_id: str
    trial_title: str
    ideal_profile: str


class BatchMatchResult(BaseModel):
    row: int
    profile: str
    total_matches: int
    top_trial_id: str | None
    top_trial_title: str | None
    top_score: int | None
    error: str | None


class TrialSearchResult(BaseModel):
    trial_id: str
    title: str
    phase: str | None
    status: str | None
    conditions: list[str]
    condition_count: int


class TrialSearchResponse(BaseModel):
    trials: list[TrialSearchResult]
    total: int
    page: int
    limit: int
    pages: int


class TrialCondition(BaseModel):
    name: str
    icd10_code: str | None = Field(default=None)


class TrialDetail(BaseModel):
    trial_id: str
    title: str
    phase: str | None
    status: str | None
    min_age: int | None
    max_age: int | None
    conditions_treated: list[TrialCondition]
    medications_used: list[str]
    conditions_excluded: list[TrialCondition]
    medications_excluded: list[str]


class MatchHistoryItem(BaseModel):
    id: str
    profile: str
    top_trial_id: str | None
    top_trial_title: str | None
    top_score: int | None
    total_matches: int
    created_at: str


class ConditionStat(BaseModel):
    name: str
    icd10_code: str | None = Field(default=None)
    trial_count: int


class DistributionItem(BaseModel):
    label: str
    count: int


class GraphStats(BaseModel):
    trial_count: int
    condition_count: int
    medication_count: int
    top_conditions: list[ConditionStat]
    phase_distribution: list[DistributionItem]
    status_distribution: list[DistributionItem]


class SimilarTrial(BaseModel):
    trial_id: str
    title: str
    shared_conditions: list[str]
    shared_medications: list[str]
    overlap_count: int


class MedicationTrialSummary(BaseModel):
    trial_id: str
    title: str
    phase: str | None = Field(default=None)
    status: str | None = Field(default=None)


class MedicationDetailResponse(BaseModel):
    name: str
    trials: list[MedicationTrialSummary]
    conditions: list[str]
    interaction_text: str | None = Field(default=None)


class EligibilityCriterion(BaseModel):
    criterion: str
    verdict: str  # "pass" | "fail" | "unknown"
    reason: str


class EligibilityRequest(BaseModel):
    profile: str


class EligibilityResponse(BaseModel):
    trial_id: str
    criteria: list[EligibilityCriterion]


class PatientProfileCreate(BaseModel):
    name: str = Field(..., examples=["John D."])
    age: int | None = Field(default=None, ge=0, le=150)
    gender: str | None = Field(default=None)
    conditions: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)
    notes: str | None = Field(default=None)


class PatientProfileUpdate(BaseModel):
    name: str | None = Field(default=None)
    age: int | None = Field(default=None, ge=0, le=150)
    gender: str | None = Field(default=None)
    conditions: list[str] | None = Field(default=None)
    medications: list[str] | None = Field(default=None)
    notes: str | None = Field(default=None)


class PatientProfileResponse(BaseModel):
    id: str
    name: str
    age: int | None = Field(default=None)
    gender: str | None = Field(default=None)
    conditions: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)
    notes: str | None = Field(default=None)
    created_at: str
    updated_at: str


class QualityIssue(BaseModel):
    type: str
    label: str
    count: int
    items: list[str] = Field(default_factory=list)


class GraphQualityResponse(BaseModel):
    health_score: int = Field(ge=0, le=100)
    total_trials: int
    pending_reviews: int
    issues: list[QualityIssue]


class PendingReviewItem(BaseModel):
    id: str
    trial_id: str
    trial_title: str
    confidence: float
    created_at: str
    extracted_json: str
