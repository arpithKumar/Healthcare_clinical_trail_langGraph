"use client";

import {useState, useRef} from "react";
import {Search, Pill, AlertTriangle, Loader2, FlaskConical} from "lucide-react";
import {motion, AnimatePresence} from "framer-motion";
import {searchMedications, fetchMedicationDetail, fetchTrialDetail} from "@/lib/api";
import type {MedicationDetail, TrialDetail} from "@/types";
import {TrialDetailDrawer} from "./TrialDetailDrawer";
import {EmptyState} from "@/components/ui/EmptyState";
import {Skeleton} from "@/components/ui/Skeleton";

function StatusBadge({value, type}: {value: string | null; type: "phase" | "status"}) {
    if (!value) return null;
    const label = value.replace("_NOT_RECRUITING", "").replace("PHASE", "Phase ");
    const color =
        type === "phase"
            ? "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/20"
            : value === "RECRUITING"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : value === "COMPLETED"
                    ? "bg-slate-500/10 text-slate-500 border-slate-500/20"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    return (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${color}`}>
            {label}
        </span>
    );
}

export function MedicationExplorer() {
    const [q, setQ] = useState("");
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [sugLoading, setSugLoading] = useState(false);
    const [detail, setDetail] = useState<MedicationDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");
    const [selectedTrial, setSelectedTrial] = useState<TrialDetail | null>(null);
    const [loadingTrialId, setLoadingTrialId] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleInputChange = (val: string) => {
        setQ(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!val.trim()) {
            setSuggestions([]);
            return;
        }
        debounceRef.current = setTimeout(() => {
            setSugLoading(true);
            searchMedications(val)
                .then(setSuggestions)
                .catch(() => setSuggestions([]))
                .finally(() => setSugLoading(false));
        }, 300);
    };

    const handleSelect = (name: string) => {
        setQ(name);
        setSuggestions([]);
        setDetail(null);
        setDetailError("");
        setDetailLoading(true);
        fetchMedicationDetail(name)
            .then(setDetail)
            .catch((e: unknown) =>
                setDetailError(e instanceof Error ? e.message : "Failed to load"),
            )
            .finally(() => setDetailLoading(false));
    };

    const handleTrialClick = (trialId: string) => {
        setLoadingTrialId(trialId);
        fetchTrialDetail(trialId)
            .then(setSelectedTrial)
            .catch(() => setSelectedTrial(null))
            .finally(() => setLoadingTrialId(null));
    };

    return (
        <div className="space-y-6">
            {/* ── Search input ───────────────────────────────────────────────── */}
            <div
                className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="relative">
                    <Search
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
                    <input
                        type="text"
                        value={q}
                        onChange={(e) => handleInputChange(e.target.value)}
                        placeholder="Search medications (e.g. metformin, ibuprofen)…"
                        className="w-full pl-11 pr-4 py-3 text-sm bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-sky-400 dark:focus:border-sky-600 focus:ring-4 focus:ring-sky-500/10 transition-all duration-200 placeholder:text-slate-400"
                    />
                    {sugLoading && (
                        <Loader2
                            className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin"/>
                    )}
                </div>

                {/* Suggestion list */}
                <AnimatePresence>
                    {suggestions.length > 0 && (
                        <motion.ul
                            initial={{opacity: 0, y: -4}}
                            animate={{opacity: 1, y: 0}}
                            exit={{opacity: 0, y: -4}}
                            transition={{duration: 0.15}}
                            className="divide-y divide-slate-100 dark:divide-slate-800"
                        >
                            {suggestions.map((name) => (
                                <li key={name}>
                                    <button
                                        onClick={() => handleSelect(name)}
                                        className="w-full flex items-center gap-2.5 px-2 py-2.5 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg transition-colors"
                                    >
                                        <Pill className="w-3.5 h-3.5 text-sky-400 shrink-0"/>
                                        {name}
                                    </button>
                                </li>
                            ))}
                        </motion.ul>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Loading skeleton ───────────────────────────────────────────── */}
            {detailLoading && (
                <div className="space-y-3">
                    <Skeleton className="h-32"/>
                    <Skeleton className="h-24"/>
                </div>
            )}

            {/* ── Error ─────────────────────────────────────────────────────── */}
            {detailError && (
                <p className="text-sm text-rose-400 px-1">{detailError}</p>
            )}

            {/* ── Empty state ────────────────────────────────────────────────── */}
            {!detailLoading && !detail && !detailError && !q && (
                <EmptyState
                    icon={<FlaskConical className="w-14 h-14"/>}
                    title="Explore by medication"
                    subtitle="Type a drug name to see which trials use it, co-occurring conditions, and known interaction flags"
                />
            )}

            {/* ── Detail panel ───────────────────────────────────────────────── */}
            <AnimatePresence>
                {detail && !detailLoading && (
                    <motion.div
                        key={detail.name}
                        initial={{opacity: 0, y: 8}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0}}
                        transition={{duration: 0.2}}
                        className="space-y-4"
                    >
                        {/* Header */}
                        <div
                            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
                                    <Pill className="w-4.5 h-4.5 text-sky-400"/>
                                </div>
                                <div>
                                    <p className="text-base font-semibold text-slate-800 dark:text-slate-100 capitalize">
                                        {detail.name}
                                    </p>
                                    <p className="text-[11px] text-slate-400">
                                        {detail.trials.length} trial{detail.trials.length !== 1 ? "s" : ""} &middot; {detail.conditions.length} condition{detail.conditions.length !== 1 ? "s" : ""}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Drug interaction warning */}
                        {detail.interaction_text && (
                            <div
                                className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0"/>
                                    <span
                                        className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                                        Known interaction text (OpenFDA)
                                    </span>
                                </div>
                                <p className="text-[11px] text-amber-400/80 leading-relaxed pl-5 line-clamp-4">
                                    {detail.interaction_text}
                                </p>
                            </div>
                        )}

                        {/* Co-occurring conditions */}
                        {detail.conditions.length > 0 && (
                            <div
                                className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Co-occurring conditions
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {detail.conditions.map((c) => (
                                        <span
                                            key={c}
                                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 capitalize"
                                        >
                                            {c}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Trials list */}
                        <div
                            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden">
                            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Trials using this medication
                                </p>
                            </div>
                            {detail.trials.length === 0 ? (
                                <p className="px-5 py-4 text-sm text-slate-400">No trials found.</p>
                            ) : (
                                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {detail.trials.map((t) => (
                                        <li key={t.trial_id}>
                                            <button
                                                onClick={() => handleTrialClick(t.trial_id)}
                                                disabled={loadingTrialId === t.trial_id}
                                                className="w-full flex items-start justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors disabled:opacity-60"
                                            >
                                                <div className="space-y-1 min-w-0">
                                                    <p className="text-[11px] font-mono text-slate-400">
                                                        {t.trial_id}
                                                    </p>
                                                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug line-clamp-2">
                                                        {t.title}
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                        <StatusBadge value={t.phase} type="phase"/>
                                                        <StatusBadge value={t.status} type="status"/>
                                                    </div>
                                                </div>
                                                {loadingTrialId === t.trial_id ? (
                                                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0 mt-1"/>
                                                ) : (
                                                    <Search className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-1"/>
                                                )}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Trial detail drawer ────────────────────────────────────────── */}
            <AnimatePresence>
                {selectedTrial && (
                    <TrialDetailDrawer
                        detail={selectedTrial}
                        onClose={() => setSelectedTrial(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
