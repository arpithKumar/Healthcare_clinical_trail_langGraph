export interface TrialResult {
    trial_id: string;
    trial_title: string;
}

export interface ScoredTrial {
    trial_id: string;
    trial_title: string;
    score: number;
    reasons: string[];
    concerns: string[];
    interaction_warnings?: string[];
    side_effect_flags?: string[];
}

export interface MatchResponse {
    patient_profile: string;
    executed_cypher: string | null;
    agent_verdict: string | null;
    trials: TrialResult[];
    scored_trials: ScoredTrial[];
    interaction_warnings: string[];
}

export interface ExtractedEntities {
    trial_title: string;
    conditions_treated: { name: string; icd10_code?: string | null }[];
    medications_used: { name: string }[];
    conditions_excluded: { name: string; icd10_code?: string | null }[];
    medications_excluded: { name: string }[];
    eligibility: {
        min_age: number | null;
        max_age: number | null;
        gender: string | null;
    };
}

export interface IngestionResponse {
    status: string;
    trial_id: string;
    extracted_entities: ExtractedEntities;
}

// ── Graph visualiser ──────────────────────────────────────────────────────────

export interface SubgraphNode {
    id: string;
    label: string;
    type: "Trial" | "Condition" | "Medication";
}

export interface SubgraphLink {
    source: string;
    target: string;
    type: string;
}

export interface SubgraphData {
    nodes: SubgraphNode[];
    links: SubgraphLink[];
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export interface WatchlistProfile {
    id: string;
    profile_text: string;
    created_at: string;
    last_trial_ids: string[] | null;
    notes: string | null;
    notes_updated_at: string | null;
}

export interface WatchlistRunResult {
    profile_id: string;
    profile_text: string;
    created_at: string;
    total_matches: number;
    new_matches: string[];
    scored_trials: ScoredTrial[];
    error: string | null;
}

// ── SSE streaming ─────────────────────────────────────────────────────────────

export type NodeStatus = "complete" | "error";

export interface ProgressEvent {
    type: "progress";
    node: string;
    label: string;
    status: NodeStatus;
}

export interface ResultEvent {
    type: "result";
    data: MatchResponse;
}

export interface ErrorEvent {
    type: "error";
    message: string;
}

export type StreamEvent = ProgressEvent | ResultEvent | ErrorEvent;

// ── Reverse matching ──────────────────────────────────────────────────────────

export interface EligibleProfileResponse {
    trial_id: string;
    trial_title: string;
    ideal_profile: string;
}

// ── Batch matching ────────────────────────────────────────────────────────────

export interface BatchMatchResult {
    row: number;
    profile: string;
    total_matches: number;
    top_trial_id: string | null;
    top_trial_title: string | null;
    top_score: number | null;
    error: string | null;
}

// ── Trial search ──────────────────────────────────────────────────────────────

export interface TrialSearchResult {
    trial_id: string;
    title: string;
    phase: string | null;
    status: string | null;
    conditions: string[];
    condition_count: number;
}

export interface TrialSearchResponse {
    trials: TrialSearchResult[];
    total: number;
    page: number;
    limit: number;
    pages: number;
}

// ── Trial detail ──────────────────────────────────────────────────────────────

export interface TrialConditionDetail {
    name: string;
    icd10_code: string | null;
}

export interface TrialDetail {
    trial_id: string;
    title: string;
    phase: string | null;
    status: string | null;
    min_age: number | null;
    max_age: number | null;
    conditions_treated: TrialConditionDetail[];
    medications_used: string[];
    conditions_excluded: TrialConditionDetail[];
    medications_excluded: string[];
}

// ── Dashboard / graph stats ───────────────────────────────────────────────────

export interface ConditionStat {
    name: string;
    icd10_code: string | null;
    trial_count: number;
}

export interface DistributionItem {
    label: string;
    count: number;
}

export interface GraphStats {
    trial_count: number;
    condition_count: number;
    medication_count: number;
    top_conditions: ConditionStat[];
    phase_distribution: DistributionItem[];
    status_distribution: DistributionItem[];
}

export interface SimilarTrial {
    trial_id: string;
    title: string;
    shared_conditions: string[];
    shared_medications: string[];
    overlap_count: number;
}

export interface MatchHistoryItem {
    id: string;
    profile: string;
    top_trial_id: string | null;
    top_trial_title: string | null;
    top_score: number | null;
    total_matches: number;
    created_at: string;
}

export interface MedicationTrialSummary {
    trial_id: string;
    title: string;
    phase: string | null;
    status: string | null;
}

export interface MedicationDetail {
    name: string;
    trials: MedicationTrialSummary[];
    conditions: string[];
    interaction_text: string | null;
}

export interface EligibilityCriterion {
    criterion: string;
    verdict: "pass" | "fail" | "unknown";
    reason: string;
}

export interface EligibilityResponse {
    trial_id: string;
    criteria: EligibilityCriterion[];
}

// ── Patient profiles ──────────────────────────────────────────────────────────

export interface PatientProfile {
    id: string;
    name: string;
    age: number | null;
    gender: string | null;
    conditions: string[];
    medications: string[];
    notes: string | null;
    created_at: string;
    updated_at: string;
}

// ── Graph quality (Feature N) ─────────────────────────────────────────────────

export interface QualityIssue {
    type: string;
    label: string;
    count: number;
    items: string[];
}

export interface GraphQuality {
    health_score: number;
    total_trials: number;
    pending_reviews: number;
    issues: QualityIssue[];
}

// ── Pending review queue (Feature O) ─────────────────────────────────────────

export interface PendingReviewItem {
    id: string;
    trial_id: string;
    trial_title: string;
    confidence: number;
    created_at: string;
    extracted_json: string;
}
