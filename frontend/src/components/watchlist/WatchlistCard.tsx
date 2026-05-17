"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, ChevronDown, ChevronUp, Sparkle } from "lucide-react";
import type {
  WatchlistProfile,
  WatchlistRunResult,
  ScoredTrial,
} from "@/types";

interface Props {
  profile: WatchlistProfile;
  runResult?: WatchlistRunResult; // present after "Run All" is clicked
  onDelete: (id: string) => void;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function WatchlistCard({ profile, runResult, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const lastCount = profile.last_trial_ids?.length ?? 0;
  const newCount = runResult?.new_matches.length ?? 0;
  const hasTrials = (runResult?.scored_trials.length ?? 0) > 0;
  const hasError = !!runResult?.error;

  const handleDelete = async () => {
    setDeleting(true);
    onDelete(profile.id);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden"
    >
      {/* Main row */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          {/* Profile text */}
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug line-clamp-2 flex-1">
            {profile.profile_text}
          </p>

          {/* Delete button */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
            aria-label="Delete profile"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-slate-400">
            Saved {formatDate(profile.created_at)}
          </span>

          {/* Previous match count */}
          {lastCount > 0 && !runResult && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
              {lastCount} match{lastCount !== 1 ? "es" : ""}
            </span>
          )}

          {/* Run result badges */}
          {runResult && !hasError && (
            <>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                {runResult.total_matches} match
                {runResult.total_matches !== 1 ? "es" : ""}
              </span>
              {newCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-500 border border-amber-400/30 flex items-center gap-1">
                  <Sparkle className="w-2.5 h-2.5" />
                  {newCount} new
                </span>
              )}
            </>
          )}

          {/* Error badge */}
          {hasError && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
              Run failed
            </span>
          )}
        </div>

        {/* Error detail */}
        {hasError && (
          <p className="mt-2 text-[11px] text-rose-400 bg-rose-500/5 rounded-lg px-3 py-2">
            {runResult?.error}
          </p>
        )}
      </div>

      {/* Expand toggle — only after a successful run with trials */}
      {hasTrials && (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="w-full flex items-center justify-between px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-500 hover:text-indigo-500 transition-colors"
        >
          <span>
            {expanded ? "Hide matched trials" : "Show matched trials"}
          </span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      {/* Expanded trial list */}
      <AnimatePresence>
        {expanded && runResult && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ul className="px-5 pb-4 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              {(runResult.scored_trials as ScoredTrial[]).map((t) => {
                const isNew = runResult.new_matches.includes(t.trial_id);
                return (
                  <li
                    key={t.trial_id}
                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs ${
                      isNew
                        ? "bg-amber-400/10 border border-amber-400/20"
                        : "bg-slate-50 dark:bg-slate-800/50"
                    }`}
                  >
                    <span className="text-slate-700 dark:text-slate-300 line-clamp-1 flex-1">
                      {t.trial_title}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {isNew && (
                        <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wide">
                          New
                        </span>
                      )}
                      <span
                        className={`text-[11px] font-bold tabular-nums ${
                          t.score >= 80
                            ? "text-emerald-500"
                            : t.score >= 50
                              ? "text-amber-500"
                              : "text-rose-500"
                        }`}
                      >
                        {t.score}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
