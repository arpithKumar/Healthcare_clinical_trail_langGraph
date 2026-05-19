"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GitFork, ChevronDown, ChevronUp, ExternalLink, Loader2 } from "lucide-react";
import { fetchSimilarTrials, fetchTrialDetail } from "@/lib/api";
import type { SimilarTrial, TrialDetail } from "@/types";
import { TrialDetailDrawer } from "@/components/search/TrialDetailDrawer";

interface SimilarTrialsPanelProps {
  topTrialId: string | undefined;
  excludeIds: string[];
}

export function SimilarTrialsPanel({ topTrialId, excludeIds }: SimilarTrialsPanelProps) {
  const [trials, setTrials] = useState<SimilarTrial[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<TrialDetail | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (!topTrialId) return;
    queueMicrotask(() => setLoading(true));
    fetchSimilarTrials(topTrialId, excludeIds)
      .then((data) => setTrials(data))
      .catch(() => setTrials([]))
      .finally(() => setLoading(false));
  }, [topTrialId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const handleViewTrial = (trialId: string) => {
    setLoadingDetailId(trialId);
    fetchTrialDetail(trialId)
      .then((data) => setSelectedDetail(data))
      .catch(() => setSelectedDetail(null))
      .finally(() => setLoadingDetailId(null));
  };

  if (!topTrialId || !loading && trials.length === 0) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm"
      >
        {/* Header — always visible */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors duration-150"
        >
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Similar Trials
            </span>
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                {trials.length}
              </span>
            )}
          </div>
          {open ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {/* Expandable content */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                {trials.map((t, i) => (
                  <motion.div
                    key={t.trial_id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.04 }}
                    className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/50"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 tabular-nums">
                          {t.overlap_count} shared
                        </span>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-snug">
                          {t.title}
                        </p>
                      </div>

                      {t.shared_conditions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {t.shared_conditions.slice(0, 4).map((c) => (
                            <span
                              key={c}
                              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/8 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/15"
                            >
                              {c}
                            </span>
                          ))}
                          {t.shared_conditions.length > 4 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] text-slate-400 border border-slate-200 dark:border-slate-700">
                              +{t.shared_conditions.length - 4} more
                            </span>
                          )}
                        </div>
                      )}

                      {t.shared_medications.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {t.shared_medications.slice(0, 4).map((m) => (
                            <span
                              key={m}
                              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/8 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/15"
                            >
                              {m}
                            </span>
                          ))}
                          {t.shared_medications.length > 4 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] text-slate-400 border border-slate-200 dark:border-slate-700">
                              +{t.shared_medications.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleViewTrial(t.trial_id)}
                      disabled={loadingDetailId === t.trial_id}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 disabled:opacity-50 transition-all duration-150"
                    >
                      {loadingDetailId === t.trial_id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3 h-3" />
                      )}
                      View
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Trial detail drawer */}
      <AnimatePresence>
        {selectedDetail && (
          <TrialDetailDrawer
            detail={selectedDetail}
            onClose={() => setSelectedDetail(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
