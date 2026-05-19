"use client";

import {motion} from "framer-motion";
import {FlaskConical, Activity, Loader2} from "lucide-react";
import type {TrialSearchResult} from "@/types";

const PHASE_STYLES: Record<string, string> = {
    PHASE1: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    PHASE2: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    PHASE3: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    PHASE4: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const PHASE_LABELS: Record<string, string> = {
    PHASE1: "Phase I",
    PHASE2: "Phase II",
    PHASE3: "Phase III",
    PHASE4: "Phase IV",
};

const STATUS_STYLES: Record<string, string> = {
    RECRUITING: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    ACTIVE_NOT_RECRUITING: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    COMPLETED: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const STATUS_LABELS: Record<string, string> = {
    RECRUITING: "Recruiting",
    ACTIVE_NOT_RECRUITING: "Active",
    COMPLETED: "Completed",
};

const MAX_CONDITIONS = 4;

interface TrialSearchCardProps {
    trial: TrialSearchResult;
    index: number;
    onClick: () => void;
    isLoading?: boolean;
}

export function TrialSearchCard({trial, index, onClick, isLoading = false}: TrialSearchCardProps) {
    const phaseStyle = trial.phase ? (PHASE_STYLES[trial.phase] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20") : null;
    const phaseLabel = trial.phase ? (PHASE_LABELS[trial.phase] ?? trial.phase) : null;
    const statusStyle = trial.status ? (STATUS_STYLES[trial.status] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20") : null;
    const statusLabel = trial.status ? (STATUS_LABELS[trial.status] ?? trial.status) : null;

    const visibleConditions = trial.conditions.slice(0, MAX_CONDITIONS);
    const hiddenCount = trial.conditions.length - visibleConditions.length;

    return (
        <motion.div
            initial={{opacity: 0, y: 8}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.2, delay: index * 0.03}}
            className={`relative cursor-pointer bg-white dark:bg-slate-900/80 border rounded-2xl p-5 transition-all duration-200 ${
                isLoading
                    ? "border-indigo-300 dark:border-indigo-700 shadow-md shadow-indigo-500/5"
                    : "border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md hover:shadow-indigo-500/5"
            }`}
            onClick={onClick}
        >
            {/* Loading overlay */}
            {isLoading && (
                <div className="absolute inset-0 rounded-2xl bg-white/60 dark:bg-slate-900/60 flex items-center justify-center z-10">
                    <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                </div>
            )}

            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug flex-1 min-w-0">
                    {trial.title || "Untitled Trial"}
                </h3>
                <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap mt-0.5">
          {trial.trial_id}
        </span>
            </div>

            {/* Badges row */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
                {phaseLabel && phaseStyle && (
                    <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${phaseStyle}`}>
            <FlaskConical className="w-3 h-3"/>
                        {phaseLabel}
          </span>
                )}
                {statusLabel && statusStyle && (
                    <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${statusStyle}`}>
            <Activity className="w-3 h-3"/>
                        {statusLabel}
          </span>
                )}
                {!phaseLabel && !statusLabel && (
                    <span className="text-[11px] text-slate-400 italic">No phase / status data</span>
                )}
            </div>

            {/* Conditions */}
            {trial.conditions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                    {visibleConditions.map((cond) => (
                        <span
                            key={cond}
                            className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/8 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/15"
                        >
              {cond}
            </span>
                    ))}
                    {hiddenCount > 0 && (
                        <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
              +{hiddenCount} more
            </span>
                    )}
                </div>
            )}
        </motion.div>
    );
}
