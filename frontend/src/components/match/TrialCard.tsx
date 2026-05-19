"use client";

import {useState} from "react";
import {
    ExternalLink,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    AlertTriangle,
    Users,
    Loader2,
    Check,
    ListChecks
} from "lucide-react";
import {motion, AnimatePresence} from "framer-motion";
import type {ScoredTrial, EligibleProfileResponse, EligibilityResponse} from "@/types";
import {fetchEligibleProfile, fetchEligibility} from "@/lib/api";

function ScoreBar({score}: { score: number }) {
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
                    initial={{width: 0}}
                    animate={{width: `${score}%`}}
                    transition={{duration: 0.6, ease: "easeOut"}}
                />
            </div>
        </div>
    );
}

interface TrialCardProps {
    trial: ScoredTrial;
    selected?: boolean;
    onToggleSelect?: () => void;
    patientProfile?: string;
}

export function TrialCard({trial, selected = false, onToggleSelect, patientProfile}: TrialCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [whoFits, setWhoFits] = useState<EligibleProfileResponse | null>(null);
    const [whoFitsOpen, setWhoFitsOpen] = useState(false);
    const [whoFitsLoading, setWhoFitsLoading] = useState(false);
    const [whoFitsError, setWhoFitsError] = useState("");
    const [sideEffectsExpanded, setSideEffectsExpanded] = useState(false);
    const [eligibility, setEligibility] = useState<EligibilityResponse | null>(null);
    const [eligibilityOpen, setEligibilityOpen] = useState(false);
    const [eligibilityLoading, setEligibilityLoading] = useState(false);
    const [eligibilityError, setEligibilityError] = useState("");

    const url = trial.trial_id.startsWith("NCT")
        ? `https://clinicaltrials.gov/study/${trial.trial_id}`
        : null;

    const hasDetails = trial.reasons.length > 0 || trial.concerns.length > 0;
    const hasInteractionWarnings =
        trial.interaction_warnings && trial.interaction_warnings.length > 0;
    const hasSideEffectFlags =
        trial.side_effect_flags && trial.side_effect_flags.length > 0;

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

    const handleEligibility = async () => {
        if (eligibility) {
            setEligibilityOpen((prev) => !prev);
            return;
        }
        if (!patientProfile) return;
        setEligibilityOpen(true);
        setEligibilityLoading(true);
        setEligibilityError("");
        try {
            const data = await fetchEligibility(trial.trial_id, patientProfile);
            setEligibility(data);
        } catch (e) {
            setEligibilityError((e as Error).message);
        } finally {
            setEligibilityLoading(false);
        }
    };

    return (
        <div className={`bg-white dark:bg-slate-900/80 border rounded-2xl transition-all duration-200 overflow-hidden ${
            selected
                ? "border-indigo-400 dark:border-indigo-600 shadow-lg shadow-indigo-500/15"
                : "border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-lg hover:shadow-indigo-500/10"
        }`}>

            {/* ── Main content ─────────────────────────────────────────────── */}
            <div className="p-5 space-y-4">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                    <span
                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 uppercase tracking-wide shrink-0">
                        Matched
                    </span>
                    <div className="flex items-center gap-2">
                        {onToggleSelect && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleSelect();
                                }}
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150 shrink-0 ${
                                    selected
                                        ? "bg-indigo-500 border-indigo-500"
                                        : "border-slate-300 dark:border-slate-600 hover:border-indigo-400"
                                }`}
                            >
                                {selected && <Check className="w-3 h-3 text-white"/>}
                            </button>
                        )}
                        {url && (
                            <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-slate-400 hover:text-indigo-500 transition-colors"
                            >
                                <ExternalLink className="w-3.5 h-3.5"/>
                            </a>
                        )}
                    </div>
                </div>

                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-3">
                    {trial.trial_title}
                </p>

                <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                    {trial.trial_id}
                </p>

                <ScoreBar score={trial.score}/>

                {/* Drug interaction warnings — always visible, safety-critical */}
                {hasInteractionWarnings && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0"/>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                                Drug interaction warning
                            </span>
                        </div>
                        <ul className="space-y-1">
                            {trial.interaction_warnings!.map((w, i) => (
                                <li key={i} className="text-[11px] text-amber-400/80 leading-snug pl-5">
                                    {w}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* ── Side effect risks toggle ──────────────────────────────────── */}
            {hasSideEffectFlags && (
                <button
                    onClick={() => setSideEffectsExpanded((prev) => !prev)}
                    className="w-full flex items-center justify-between px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 transition-colors"
                >
                    <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5"/>
                        {sideEffectsExpanded
                            ? "Hide side effect risks"
                            : `${trial.side_effect_flags!.length} side effect risk${trial.side_effect_flags!.length !== 1 ? "s" : ""}`}
                    </span>
                    {sideEffectsExpanded
                        ? <ChevronUp className="w-3.5 h-3.5"/>
                        : <ChevronDown className="w-3.5 h-3.5"/>}
                </button>
            )}

            {/* ── Side effect risks panel ───────────────────────────────────── */}
            <AnimatePresence>
                {sideEffectsExpanded && hasSideEffectFlags && (
                    <motion.div
                        initial={{height: 0, opacity: 0}}
                        animate={{height: "auto", opacity: 1}}
                        exit={{height: 0, opacity: 0}}
                        transition={{duration: 0.25}}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-4 pt-3 border-t border-rose-100 dark:border-rose-900/30 bg-rose-500/5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500 mb-2">
                                Adverse reaction risks
                            </p>
                            <ul className="space-y-1.5">
                                {trial.side_effect_flags!.map((flag, i) => (
                                    <li key={i} className="flex items-start gap-2">
                                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0"/>
                                        <span
                                            className="text-[11px] text-rose-500/80 dark:text-rose-400/80 leading-snug">
                                            {flag}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Reasons & concerns toggle ─────────────────────────────────── */}
            {hasDetails && (
                <button
                    onClick={() => setExpanded((prev) => !prev)}
                    className="w-full flex items-center justify-between px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                >
                    <span>{expanded ? "Hide details" : "Show reasons & concerns"}</span>
                    {expanded
                        ? <ChevronUp className="w-3.5 h-3.5"/>
                        : <ChevronDown className="w-3.5 h-3.5"/>}
                </button>
            )}

            {/* ── Reasons & concerns panel ──────────────────────────────────── */}
            <AnimatePresence>
                {expanded && hasDetails && (
                    <motion.div
                        initial={{height: 0, opacity: 0}}
                        animate={{height: "auto", opacity: 1}}
                        exit={{height: 0, opacity: 0}}
                        transition={{duration: 0.25}}
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
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0"/>
                                                <span
                                                    className="text-[12px] text-slate-600 dark:text-slate-300 leading-snug">
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
                                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0"/>
                                                <span
                                                    className="text-[12px] text-slate-600 dark:text-slate-300 leading-snug">
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

            {/* ── Eligibility breakdown toggle ────────────────────────────────── */}
            {patientProfile && (
                <button
                    onClick={handleEligibility}
                    disabled={eligibilityLoading}
                    className="w-full flex items-center justify-between px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 disabled:opacity-60 transition-colors"
                >
        <span className="flex items-center gap-1.5">
            {eligibilityLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin"/>
                : <ListChecks className="w-3.5 h-3.5"/>}
            {eligibilityLoading ? "Evaluating…" : "Eligibility Breakdown"}
        </span>
                    {eligibility && (eligibilityOpen
                        ? <ChevronUp className="w-3.5 h-3.5"/>
                        : <ChevronDown className="w-3.5 h-3.5"/>)}
                </button>
            )}

            {/* ── Eligibility breakdown panel ──────────────────────────────────── */}
            <AnimatePresence>
                {eligibilityOpen && (eligibility ?? eligibilityError) && (
                    <motion.div
                        initial={{height: 0, opacity: 0}}
                        animate={{height: "auto", opacity: 1}}
                        exit={{height: 0, opacity: 0}}
                        transition={{duration: 0.25}}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-5 pt-3 border-t border-slate-100 dark:border-slate-800">
                            {eligibilityError ? (
                                <p className="text-[12px] text-rose-400">{eligibilityError}</p>
                            ) : eligibility && eligibility.criteria.length === 0 ? (
                                <p className="text-[12px] text-slate-400">No structured criteria available for this
                                    trial.</p>
                            ) : eligibility ? (
                                <ul className="space-y-2">
                                    {eligibility.criteria.map((item, i) => {
                                        const isPass = item.verdict === "pass";
                                        const isFail = item.verdict === "fail";
                                        const rowColor = isPass
                                            ? "bg-emerald-500/5 border-emerald-500/15"
                                            : isFail
                                                ? "bg-rose-500/5 border-rose-500/15"
                                                : "bg-slate-500/5 border-slate-500/10";
                                        const iconColor = isPass
                                            ? "text-emerald-500"
                                            : isFail
                                                ? "text-rose-400"
                                                : "text-slate-400";
                                        const Icon = isPass
                                            ? CheckCircle2
                                            : isFail
                                                ? AlertTriangle
                                                : ListChecks;
                                        return (
                                            <li key={i}
                                                className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${rowColor}`}>
                                                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${iconColor}`}/>
                                                <div className="space-y-0.5 min-w-0">
                                                    <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200 leading-snug capitalize">
                                                        {item.criterion}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                                                        {item.reason}
                                                    </p>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : null}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Who fits? toggle ──────────────────────────────────────────── */}
            <button
                onClick={handleWhoFits}
                disabled={whoFitsLoading}
                className="w-full flex items-center justify-between px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-violet-500 dark:hover:text-violet-400 disabled:opacity-60 transition-colors"
            >
                <span className="flex items-center gap-1.5">
                    {whoFitsLoading
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin"/>
                        : <Users className="w-3.5 h-3.5"/>}
                    {whoFitsLoading ? "Generating profile…" : "Who fits this trial?"}
                </span>
                {whoFits && (whoFitsOpen
                    ? <ChevronUp className="w-3.5 h-3.5"/>
                    : <ChevronDown className="w-3.5 h-3.5"/>)}
            </button>

            {/* ── Who fits? panel ───────────────────────────────────────────── */}
            <AnimatePresence>
                {whoFitsOpen && (whoFits ?? whoFitsError) && (
                    <motion.div
                        initial={{height: 0, opacity: 0}}
                        animate={{height: "auto", opacity: 1}}
                        exit={{height: 0, opacity: 0}}
                        transition={{duration: 0.25}}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-5 pt-3 border-t border-slate-100 dark:border-slate-800">
                            {whoFitsError ? (
                                <p className="text-[12px] text-rose-400">{whoFitsError}</p>
                            ) : whoFits ? (
                                <div
                                    className="flex items-start gap-3 p-3 rounded-xl bg-violet-500/5 border border-violet-500/15">
                                    <Users className="w-4 h-4 text-violet-400 shrink-0 mt-0.5"/>
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
