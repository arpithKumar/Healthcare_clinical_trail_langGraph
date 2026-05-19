"use client";

import { motion } from "framer-motion";
import { X, CheckCircle2, AlertTriangle } from "lucide-react";
import type { ScoredTrial } from "@/types";

function ScoreCell({ score }: { score: number }) {
  const barColor =
    score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-400" : "bg-rose-500";
  const textColor =
    score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-rose-400";
  return (
    <div className="space-y-1.5">
      <span className={`text-lg font-bold tabular-nums ${textColor}`}>{score}%</span>
      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

interface CompareModalProps {
  trials: ScoredTrial[];
  onClose: () => void;
}

export function CompareModal({ trials, onClose }: CompareModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Trial Comparison
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {trials.length} trial{trials.length !== 1 ? "s" : ""} side by side
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Comparison table */}
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="p-4 w-36 shrink-0" />
                {trials.map((t) => (
                  <th key={t.trial_id} className="p-4 text-left min-w-52 align-top">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                      {t.trial_title}
                    </p>
                    <p className="font-mono text-[10px] text-slate-400 mt-1">{t.trial_id}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Score */}
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-4 text-[11px] font-bold uppercase tracking-widest text-slate-400 align-top">
                  Score
                </td>
                {trials.map((t) => (
                  <td key={t.trial_id} className="p-4 align-top">
                    <ScoreCell score={t.score} />
                  </td>
                ))}
              </tr>

              {/* Reasons */}
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                <td className="p-4 text-[11px] font-bold uppercase tracking-widest text-emerald-500 align-top">
                  Reasons
                </td>
                {trials.map((t) => (
                  <td key={t.trial_id} className="p-4 align-top">
                    {t.reasons.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">None</span>
                    ) : (
                      <ul className="space-y-1.5">
                        {t.reasons.map((r, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                            <span className="text-xs text-slate-600 dark:text-slate-300 leading-snug">{r}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                ))}
              </tr>

              {/* Concerns */}
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-4 text-[11px] font-bold uppercase tracking-widest text-amber-500 align-top">
                  Concerns
                </td>
                {trials.map((t) => (
                  <td key={t.trial_id} className="p-4 align-top">
                    {t.concerns.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">None</span>
                    ) : (
                      <ul className="space-y-1.5">
                        {t.concerns.map((c, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                            <span className="text-xs text-slate-600 dark:text-slate-300 leading-snug">{c}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                ))}
              </tr>

              {/* Drug interaction warnings */}
              <tr className="bg-slate-50/50 dark:bg-slate-800/20">
                <td className="p-4 text-[11px] font-bold uppercase tracking-widest text-amber-500 align-top whitespace-nowrap">
                  Interactions
                </td>
                {trials.map((t) => (
                  <td key={t.trial_id} className="p-4 align-top">
                    {!t.interaction_warnings || t.interaction_warnings.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">None</span>
                    ) : (
                      <ul className="space-y-1.5">
                        {t.interaction_warnings.map((w, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                            <span className="text-xs text-amber-600 dark:text-amber-400 leading-snug">{w}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}
