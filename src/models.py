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
