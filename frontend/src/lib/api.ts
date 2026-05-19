import type {
    MatchResponse,
    IngestionResponse,
    StreamEvent,
    SubgraphData,
    WatchlistProfile,
    WatchlistRunResult,
    EligibleProfileResponse,
    BatchMatchResult,
    TrialSearchResponse,
    TrialDetail,
    GraphStats,
    ConditionStat,
    SimilarTrial,
    PatientProfile,
    MatchHistoryItem,
    MedicationDetail,
    EligibilityResponse,
    GraphQuality,
    PendingReviewItem
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface MatchFilters {
    phase?: string | null;
    status?: string | null;
    provider?: string | null;
    model?: string | null;
}

// ── Match ─────────────────────────────────────────────────────────────────────

export async function matchPatient(
    profile: string,
    filters?: MatchFilters,
): Promise<MatchResponse> {
    const params = new URLSearchParams();
    if (filters?.phase) params.set("phase", filters.phase);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.provider) params.set("provider", filters.provider);
    if (filters?.model) params.set("model", filters.model);
    const qs = params.toString() ? `?${params}` : "";
    const res = await fetch(`${BASE_URL}/api/v1/patients/match${qs}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({profile}),
    });
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function matchFhirPatient(bundle: object): Promise<MatchResponse> {
    const res = await fetch(`${BASE_URL}/api/v1/patients/match/fhir`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(bundle),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
            (body as { detail?: string }).detail ??
            `API Error ${res.status}: ${res.statusText}`,
        );
    }
    return res.json();
}

export async function* streamMatchPatient(
    profile: string,
    filters?: MatchFilters,
): AsyncGenerator<StreamEvent> {
    const params = new URLSearchParams();
    if (filters?.phase) params.set("phase", filters.phase);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.provider) params.set("provider", filters.provider);
    if (filters?.model) params.set("model", filters.model);
    const qs = params.toString() ? `?${params}` : "";
    const res = await fetch(`${BASE_URL}/api/v1/patients/match/stream${qs}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({profile}),
    });
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    if (!res.body) throw new Error("No response body from server");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            if (line.startsWith("data: ")) {
                const jsonStr = line.slice(6).trim();
                if (jsonStr) yield JSON.parse(jsonStr) as StreamEvent;
            }
        }
    }
}

// ── Ingest ────────────────────────────────────────────────────────────────────

export async function ingestTrial(
    text: string,
    trialId?: string,
): Promise<IngestionResponse> {
    const res = await fetch(`${BASE_URL}/api/v1/trials/ingest`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({text, ...(trialId ? {trial_id: trialId} : {})}),
    });
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

// ── Graph ─────────────────────────────────────────────────────────────────────

export async function fetchSubgraph(trialIds: string[]): Promise<SubgraphData> {
    const params = new URLSearchParams({trial_ids: trialIds.join(",")});
    const res = await fetch(`${BASE_URL}/api/v1/graph/subgraph?${params}`);
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export async function getWatchlist(): Promise<WatchlistProfile[]> {
    const res = await fetch(`${BASE_URL}/api/v1/watchlist`);
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function saveToWatchlist(
    profileText: string,
): Promise<WatchlistProfile> {
    const res = await fetch(`${BASE_URL}/api/v1/watchlist`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({profile_text: profileText}),
    });
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function deleteFromWatchlist(id: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/api/v1/watchlist/${id}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
}

export async function runWatchlist(): Promise<WatchlistRunResult[]> {
    const res = await fetch(`${BASE_URL}/api/v1/watchlist/run`, {
        method: "POST",
    });
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function updateWatchlistNotes(
    id: string,
    notes: string,
): Promise<void> {
    const res = await fetch(`${BASE_URL}/api/v1/watchlist/${id}/notes`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({notes}),
    });
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
}

// ── Reverse matching ──────────────────────────────────────────────────────────

export async function fetchEligibleProfile(
    trialId: string,
): Promise<EligibleProfileResponse> {
    const res = await fetch(
        `${BASE_URL}/api/v1/trials/${encodeURIComponent(trialId)}/eligible-profile`,
        {method: "POST"},
    );
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
            (body as { detail?: string }).detail ??
            `API Error ${res.status}: ${res.statusText}`,
        );
    }
    return res.json();
}

// ── Batch matching ────────────────────────────────────────────────────────────

export async function matchPatientsBatch(
    file: File,
): Promise<BatchMatchResult[]> {
    const form = new FormData();
    form.append("file", file);
    // Do NOT set Content-Type — browser sets it automatically with the multipart boundary
    const res = await fetch(`${BASE_URL}/api/v1/patients/match/batch`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
            (body as { detail?: string }).detail ??
            `API Error ${res.status}: ${res.statusText}`,
        );
    }
    return res.json();
}

// ── Seed scheduler ────────────────────────────────────────────────────────────

export async function triggerSeed(): Promise<{ status: string; message: string }> {
    const res = await fetch(`${BASE_URL}/api/v1/admin/seed`, {method: "POST"});
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function getSeedStatus(): Promise<{ next_run: string | null }> {
    const res = await fetch(`${BASE_URL}/api/v1/admin/seed/status`);
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

// ── Trial search ──────────────────────────────────────────────────────────────

export interface SearchFilters {
    q?: string;
    condition?: string;
    phase?: string | null;
    status?: string | null;
    page?: number;
    limit?: number;
}

export async function searchTrials(
    filters: SearchFilters = {},
): Promise<TrialSearchResponse> {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.condition) params.set("condition", filters.condition);
    if (filters.phase) params.set("phase", filters.phase);
    if (filters.status) params.set("status", filters.status);
    if (filters.page && filters.page > 1) params.set("page", String(filters.page));
    if (filters.limit) params.set("limit", String(filters.limit));
    const qs = params.toString() ? `?${params}` : "";
    const res = await fetch(`${BASE_URL}/api/v1/trials/search${qs}`);
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function fetchTrialDetail(trialId: string): Promise<TrialDetail> {
    const res = await fetch(
        `${BASE_URL}/api/v1/trials/${encodeURIComponent(trialId)}`,
    );
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
            (body as { detail?: string }).detail ??
            `API Error ${res.status}: ${res.statusText}`,
        );
    }
    return res.json();
}

// ── Dashboard stats ───────────────────────────────────────────────────────────

export async function fetchGraphStats(): Promise<GraphStats> {
    const res = await fetch(`${BASE_URL}/api/v1/graph/stats`);
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function fetchConditions(
    status?: string,
    limit = 50,
): Promise<ConditionStat[]> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (limit !== 50) params.set("limit", String(limit));
    const qs = params.toString() ? `?${params}` : "";
    const res = await fetch(`${BASE_URL}/api/v1/graph/conditions${qs}`);
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

// ── Similar trials ────────────────────────────────────────────────────────────

export async function fetchSimilarTrials(
    trialId: string,
    excludeIds: string[] = [],
): Promise<SimilarTrial[]> {
    const params = new URLSearchParams();
    if (excludeIds.length > 0) params.set("exclude", excludeIds.join(","));
    const qs = params.toString() ? `?${params}` : "";
    const res = await fetch(
        `${BASE_URL}/api/v1/trials/${encodeURIComponent(trialId)}/similar${qs}`,
    );
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

// ── Match history ─────────────────────────────────────────────────────────────

export async function fetchMatchHistory(limit = 20): Promise<MatchHistoryItem[]> {
    const res = await fetch(`${BASE_URL}/api/v1/history?limit=${limit}`);
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

// ── Medication explorer ───────────────────────────────────────────────────────

export async function searchMedications(q: string): Promise<string[]> {
    const res = await fetch(
        `${BASE_URL}/api/v1/medications/search?q=${encodeURIComponent(q)}`,
    );
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function fetchMedicationDetail(name: string): Promise<MedicationDetail> {
    const res = await fetch(
        `${BASE_URL}/api/v1/medications/${encodeURIComponent(name)}`,
    );
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
            (body as { detail?: string }).detail ??
            `API Error ${res.status}: ${res.statusText}`,
        );
    }
    return res.json();
}

// ── Eligibility explainer ─────────────────────────────────────────────────────

export async function fetchEligibility(
    trialId: string,
    profile: string,
): Promise<EligibilityResponse> {
    const res = await fetch(
        `${BASE_URL}/api/v1/trials/${encodeURIComponent(trialId)}/eligibility`,
        {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({profile}),
        },
    );
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
            (body as { detail?: string }).detail ??
            `API Error ${res.status}: ${res.statusText}`,
        );
    }
    return res.json();
}

// ── Patient profiles ──────────────────────────────────────────────────────────

export async function listPatientProfiles(): Promise<PatientProfile[]> {
    const res = await fetch(`${BASE_URL}/api/v1/patient-profiles`);
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function createPatientProfile(
    data: Omit<PatientProfile, "id" | "created_at" | "updated_at">,
): Promise<PatientProfile> {
    const res = await fetch(`${BASE_URL}/api/v1/patient-profiles`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function updatePatientProfile(
    id: string,
    data: Partial<Omit<PatientProfile, "id" | "created_at" | "updated_at">>,
): Promise<PatientProfile> {
    const res = await fetch(
        `${BASE_URL}/api/v1/patient-profiles/${encodeURIComponent(id)}`,
        {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(data),
        },
    );
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function deletePatientProfile(id: string): Promise<void> {
    const res = await fetch(
        `${BASE_URL}/api/v1/patient-profiles/${encodeURIComponent(id)}`,
        {method: "DELETE"},
    );
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
}

// ── Graph quality (Feature N) ─────────────────────────────────────────────────

export async function fetchGraphQuality(): Promise<GraphQuality> {
    const res = await fetch(`${BASE_URL}/api/v1/graph/quality`);
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function fixMissingIcd10(): Promise<{ fixed: number }> {
    const res = await fetch(`${BASE_URL}/api/v1/graph/quality/fix-icd10`, {
        method: "POST",
    });
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

// ── Pending review queue (Feature O) ─────────────────────────────────────────

export async function fetchPendingReviews(): Promise<PendingReviewItem[]> {
    const res = await fetch(`${BASE_URL}/api/v1/trials/review`);
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    return res.json();
}

export async function approvePendingReview(
    id: string,
): Promise<{ status: string; trial_id: string }> {
    const res = await fetch(
        `${BASE_URL}/api/v1/trials/review/${encodeURIComponent(id)}/approve`,
        {method: "POST"},
    );
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
            (body as { detail?: string }).detail ??
            `API Error ${res.status}: ${res.statusText}`,
        );
    }
    return res.json();
}

export async function rejectPendingReview(id: string): Promise<void> {
    const res = await fetch(
        `${BASE_URL}/api/v1/trials/review/${encodeURIComponent(id)}/reject`,
        {method: "POST"},
    );
    if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
}
