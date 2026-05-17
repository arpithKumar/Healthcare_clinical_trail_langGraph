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
