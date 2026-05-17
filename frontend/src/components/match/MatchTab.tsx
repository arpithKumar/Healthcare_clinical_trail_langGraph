"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileSearch,
  FileText,
  Network,
  BookMarked,
  Check,
  User,
  LayoutList,
} from "lucide-react";
import {
  streamMatchPatient,
  matchFhirPatient,
  saveToWatchlist,
} from "@/lib/api";
import type {
  MatchResponse,
  ProgressEvent,
  ScoredTrial,
  TrialResult,
} from "@/types";
import { PatientInput, type InputMode } from "./PatientInput";
import { VerdictCard } from "./VerdictCard";
import { TrialCard } from "./TrialCard";
import { CypherTrace } from "./CypherTrace";
import { StreamingProgress } from "./StreamingProgress";
import { BatchUpload } from "./BatchUpload";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { DownloadReportButton } from "./DownloadReportButton";

const NEXT_ACTIVE_LABEL: Record<string, string> = {
  analyze_query: "Generating Cypher query",
  generate_cypher: "Searching Neo4j",
  execute_query: "Scoring trial matches",
  score_matches: "Evaluating matches",
  evaluate_results: "",
};

const EXAMPLE_FHIR = JSON.stringify(
  {
    resourceType: "Bundle",
    type: "collection",
    entry: [
      {
        resource: {
          resourceType: "Patient",
          birthDate: "1969-03-12",
          gender: "male",
        },
      },
      {
        resource: {
          resourceType: "Condition",
          code: { text: "Type 2 Diabetes" },
        },
      },
      {
        resource: { resourceType: "Condition", code: { text: "Hypertension" } },
      },
      {
        resource: {
          resourceType: "MedicationStatement",
          medicationCodeableConcept: { text: "Metformin" },
        },
      },
    ],
  },
  null,
  2,
);

function toUnscoredTrial(t: TrialResult): ScoredTrial {
  return {
    trial_id: t.trial_id,
    trial_title: t.trial_title,
    score: 0,
    reasons: [],
    concerns: [],
  };
}

interface Props {
  onVisualize: (trialIds: string[]) => void;
}

export function MatchTab({ onVisualize }: Props) {
  const [batchMode, setBatchMode] = useState(false);
  const [mode, setMode] = useState<InputMode>("text");
  const [profile, setProfile] = useState("45yo female with hypertension.");
  const [fhirJson, setFhirJson] = useState(EXAMPLE_FHIR);
  const [phase, setPhase] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleMatch = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setEvents([]);
    setActiveLabel(null);
    setSaved(false);

    if (mode === "fhir") {
      try {
        const bundle = JSON.parse(fhirJson) as object;
        const res = await matchFhirPatient(bundle);
        setResult(res);
      } catch (e: unknown) {
        setError(
          e instanceof Error ? e.message : "Invalid FHIR JSON or server error",
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    setActiveLabel("Analyzing patient profile");
    try {
      const filters = {
        phase: phase ?? undefined,
        status: status ?? undefined,
      };
      for await (const event of streamMatchPatient(profile, filters)) {
        if (event.type === "progress") {
          setEvents((prev) => [...prev, event]);
          if (event.node === "execute_query" && event.status === "error") {
            setActiveLabel("Retrying Cypher generation…");
          } else {
            const next = NEXT_ACTIVE_LABEL[event.node] ?? "";
            setActiveLabel(next || null);
          }
        } else if (event.type === "result") {
          setResult(event.data);
          setActiveLabel(null);
        } else if (event.type === "error") {
          setError(event.message);
          setActiveLabel(null);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setActiveLabel(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await saveToWatchlist(result.patient_profile);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save to watchlist");
    } finally {
      setSaving(false);
    }
  };

  const handleVisualize = () => {
    if (!result) return;
    const ids =
      result.scored_trials.length > 0
        ? result.scored_trials.map((t) => t.trial_id)
        : result.trials.map((t) => t.trial_id);
    onVisualize(ids);
  };

  const displayTrials: ScoredTrial[] =
    result && result.scored_trials.length > 0
      ? result.scored_trials
      : result
        ? result.trials.map(toUnscoredTrial)
        : [];

  const showProgress =
    loading && mode === "text" && (events.length > 0 || activeLabel !== null);

  return (
    <div className="space-y-6">
      {/* Mode switcher */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setBatchMode(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-150 ${
              !batchMode
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            <User className="w-3 h-3" />
            Single Patient
          </button>
          <button
            onClick={() => setBatchMode(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-150 ${
              batchMode
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            <LayoutList className="w-3 h-3" />
            Batch Upload
          </button>
        </div>
      </div>

      {/* Batch mode */}
      {batchMode ? (
        <BatchUpload />
      ) : (
        /* Single patient mode */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 lg:sticky lg:top-28 space-y-4">
            <PatientInput
              mode={mode}
              onModeChange={setMode}
              profile={profile}
              onProfileChange={setProfile}
              fhirJson={fhirJson}
              onFhirJsonChange={setFhirJson}
              phase={phase}
              onPhaseChange={setPhase}
              status={status}
              onStatusChange={setStatus}
              onSubmit={handleMatch}
              loading={loading}
            />
            <AnimatePresence>
              {showProgress && (
                <motion.div
                  key="progress"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  <StreamingProgress
                    events={events}
                    activeLabel={activeLabel}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {error && <ErrorBanner message={error} />}
            </AnimatePresence>
          </div>

          <div className="lg:col-span-8 space-y-5">
            <AnimatePresence mode="wait">
              {!result && !loading && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <EmptyState
                    icon={<FileSearch className="w-14 h-14" />}
                    title="No results yet"
                    subtitle={
                      mode === "fhir"
                        ? "Paste a FHIR Bundle and click Match FHIR Patient"
                        : "Enter a patient profile and click Find Matching Trials"
                    }
                  />
                </motion.div>
              )}

              {loading && !result && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5"
                >
                  <Skeleton className="h-52" />
                  <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-40" />
                    <Skeleton className="h-40" />
                  </div>
                </motion.div>
              )}

              {result && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  {mode === "fhir" && (
                    <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                      <span className="font-semibold text-emerald-400 shrink-0">
                        Parsed profile:
                      </span>
                      <span className="text-emerald-300">
                        {result.patient_profile}
                      </span>
                    </div>
                  )}

                  <VerdictCard
                    verdict={result.agent_verdict ?? "No verdict returned."}
                  />

                  {displayTrials.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {displayTrials.map((t) => (
                          <TrialCard key={t.trial_id} trial={t} />
                        ))}
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-3 gap-3">
                        <motion.button
                          onClick={handleVisualize}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className="flex items-center justify-center gap-2 py-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-sm font-medium hover:bg-indigo-500/20 hover:border-indigo-500/60 transition-all duration-200"
                        >
                          <Network className="w-4 h-4" />
                          Visualise Graph
                        </motion.button>

                        <motion.button
                          onClick={handleSave}
                          disabled={saving || saved}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                            saved
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 cursor-default"
                              : "border border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:border-violet-500/60"
                          } disabled:opacity-50`}
                        >
                          {saved ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <BookMarked className="w-4 h-4" />
                          )}
                          {saved
                            ? "Saved!"
                            : saving
                              ? "Saving…"
                              : "Save to Watchlist"}
                        </motion.button>

                        <DownloadReportButton
                          result={result}
                          displayTrials={displayTrials}
                        />
                      </div>
                    </>
                  ) : (
                    <EmptyState
                      icon={<FileText className="w-12 h-12" />}
                      title="No matching trials found"
                      subtitle="Try a different profile or ingest more trials first"
                    />
                  )}

                  <CypherTrace cypher={result.executed_cypher} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
