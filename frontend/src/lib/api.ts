import type {
  MatchResponse,
  IngestionResponse,
  StreamEvent,
  SubgraphData,
  WatchlistProfile,
  WatchlistRunResult,
  EligibleProfileResponse,
  BatchMatchResult,
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface MatchFilters {
  phase?: string | null;
  status?: string | null;
}

// ── Match ─────────────────────────────────────────────────────────────────────

export async function matchPatient(
  profile: string,
  filters?: MatchFilters,
): Promise<MatchResponse> {
  const params = new URLSearchParams();
  if (filters?.phase) params.set("phase", filters.phase);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString() ? `?${params}` : "";
  const res = await fetch(`${BASE_URL}/api/v1/patients/match${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function matchFhirPatient(bundle: object): Promise<MatchResponse> {
  const res = await fetch(`${BASE_URL}/api/v1/patients/match/fhir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const qs = params.toString() ? `?${params}` : "";
  const res = await fetch(`${BASE_URL}/api/v1/patients/match/stream${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
  if (!res.body) throw new Error("No response body from server");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...(trialId ? { trial_id: trialId } : {}) }),
  });
  if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
  return res.json();
}

// ── Graph ─────────────────────────────────────────────────────────────────────

export async function fetchSubgraph(trialIds: string[]): Promise<SubgraphData> {
  const params = new URLSearchParams({ trial_ids: trialIds.join(",") });
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile_text: profileText }),
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

// ── Reverse matching ──────────────────────────────────────────────────────────

export async function fetchEligibleProfile(
  trialId: string,
): Promise<EligibleProfileResponse> {
  const res = await fetch(
    `${BASE_URL}/api/v1/trials/${encodeURIComponent(trialId)}/eligible-profile`,
    { method: "POST" },
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
  const res = await fetch(`${BASE_URL}/api/v1/admin/seed`, { method: "POST" });
  if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function getSeedStatus(): Promise<{ next_run: string | null }> {
  const res = await fetch(`${BASE_URL}/api/v1/admin/seed/status`);
  if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
  return res.json();
}