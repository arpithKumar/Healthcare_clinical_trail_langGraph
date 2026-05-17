"use client";

import { useState } from "react";
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Users,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ScoredTrial, EligibleProfileResponse } from "@/types";
import { fetchEligibleProfile } from "@/lib/api";

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-500"
      : score >= 50
        ? "bg-amber-400"
        : "bg-rose-500";

  const textColor =
    score >= 80
      ? "text-emerald-400"
      : score >= 50
        ? "text-amber-400"
        : "text-rose-400";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">
          Match score
        </span>
        <span className={`text-sm font-bold tabular-nums ${textColor}`}>
          {score}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export function TrialCard({ trial }: { trial: ScoredTrial }) {
  const [expanded, setExpanded] = useState(false);
  const [whoFits, setWhoFits] = useState<EligibleProfileResponse | null>(null);
  const [whoFitsOpen, setWhoFitsOpen] = useState(false);
  const [whoFitsLoading, setWhoFitsLoading] = useState(false);
  const [whoFitsError, setWhoFitsError] = useState("");

  const url = trial.trial_id.startsWith("NCT")
    ? `https://clinicaltrials.gov/study/${trial.trial_id}`
    : null;

  const hasDetails = trial.reasons.length > 0 || trial.concerns.length > 0;
  const hasInteractionWarnings =
    trial.interaction_warnings && trial.interaction_warnings.length > 0;

  const handleWhoFits = async () => {
    if (whoFits) {
      setWhoFitsOpen((prev) => !prev);
      return;
    }
    setWhoFitsOpen(true);
    setWhoFitsLoading(true);
    setWhoFitsError("");
    try {
      const data = await fetchEligibleProfile(trial.trial_id);
      setWhoFits(data);
    } catch (e) {
      setWhoFitsError((e as Error).message);
    } finally {
      setWhoFitsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-200 overflow-hidden">
      {/* Header row */}
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 uppercase tracking-wide shrink-0">
            Matched
          </span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-slate-400 hover:text-indigo-500 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-3">
          {trial.trial_title}
        </p>

        <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
          {trial.trial_id}
        </p>

        <ScoreBar score={trial.score} />

        {/* Drug interaction warnings — always visible when present */}
        {hasInteractionWarnings && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                Drug interaction warning
              </span>
            </div>
            <ul className="space-y-1">
              {trial.interaction_warnings!.map((w, i) => (
                <li
                  key={i}
                  className="text-[11px] text-amber-400/80 leading-snug pl-5"
                >
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Reasons & concerns toggle */}
      {hasDetails && (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
        >
          <span>{expanded ? "Hide details" : "Show reasons & concerns"}</span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      {/* Reasons & concerns expanded panel */}
      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
              {trial.reasons.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2">
                    Why it matches
                  </p>
                  <ul className="space-y-1.5">
                    {trial.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        <span className="text-[12px] text-slate-600 dark:text-slate-300 leading-snug">
                          {r}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {trial.concerns.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2">
                    Concerns to verify
                  </p>
                  <ul className="space-y-1.5">
                    {trial.concerns.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                        <span className="text-[12px] text-slate-600 dark:text-slate-300 leading-snug">
                          {c}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Who fits? toggle */}
      <button
        onClick={handleWhoFits}
        disabled={whoFitsLoading}
        className="w-full flex items-center justify-between px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-violet-500 dark:hover:text-violet-400 disabled:opacity-60 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {whoFitsLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Users className="w-3.5 h-3.5" />
          )}
          {whoFitsLoading ? "Generating profile…" : "Who fits this trial?"}
        </span>
        {whoFits &&
          (whoFitsOpen ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          ))}
      </button>

      {/* Who fits? expanded panel */}
      <AnimatePresence>
        {whoFitsOpen && (whoFits ?? whoFitsError) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-3 border-t border-slate-100 dark:border-slate-800">
              {whoFitsError ? (
                <p className="text-[12px] text-rose-400">{whoFitsError}</p>
              ) : whoFits ? (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-violet-500/5 border border-violet-500/15">
                  <Users className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {whoFits.ideal_profile}
                  </p>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
