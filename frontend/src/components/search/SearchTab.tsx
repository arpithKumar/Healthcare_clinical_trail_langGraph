"use client";

import {useState, useEffect, useRef} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {
    Search,
    SlidersHorizontal,
    ChevronLeft,
    ChevronRight,
    Microscope,
    FlaskConical,
} from "lucide-react";
import {searchTrials, fetchTrialDetail} from "@/lib/api";
import type {TrialSearchResult, TrialSearchResponse, TrialDetail} from "@/types";
import {TrialSearchCard} from "./TrialSearchCard";
import {MedicationExplorer} from "./MedicationExplorer";
import {EmptyState} from "@/components/ui/EmptyState";
import {ErrorBanner} from "@/components/ui/ErrorBanner";
import {Skeleton} from "@/components/ui/Skeleton";
import {TrialDetailDrawer} from "./TrialDetailDrawer";

const PHASE_OPTIONS = [
    {label: "Phase I", value: "PHASE1"},
    {label: "Phase II", value: "PHASE2"},
    {label: "Phase III", value: "PHASE3"},
    {label: "Phase IV", value: "PHASE4"},
] as const;

const STATUS_OPTIONS = [
    {label: "Recruiting", value: "RECRUITING"},
    {label: "Active", value: "ACTIVE_NOT_RECRUITING"},
    {label: "Completed", value: "COMPLETED"},
] as const;

function FilterChip({
                        label,
                        active,
                        onClick,
                    }: {
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 ${
                active
                    ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-500 dark:text-indigo-400"
                    : "bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600"
            }`}
        >
            {label}
        </button>
    );
}

const PAGE_SIZE = 20;

interface SearchTabProps {
    initialCondition?: string;
}

export function SearchTab({initialCondition}: SearchTabProps) {
    const [mode, setMode] = useState<"trials" | "medications">("trials");
    const [q, setQ] = useState("");
    const [condition, setCondition] = useState(initialCondition ?? "");
    const [phase, setPhase] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    const [response, setResponse] = useState<TrialSearchResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [hasSearched, setHasSearched] = useState(false);
    const [selectedDetail, setSelectedDetail] = useState<TrialDetail | null>(null);
    const [loadingTrialId, setLoadingTrialId] = useState<string | null>(null);

    // Sync when parent navigates here with a new pre-filled condition (React 19 compliant)
    useEffect(() => {
        if (initialCondition !== undefined) {
            queueMicrotask(() => setCondition(initialCondition));
        }
    }, [initialCondition]);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Always-current snapshot — read by the page effect to avoid stale deps
    const latestRef = useRef({q, condition, phase, status, hasSearched});
    useEffect(() => {
        latestRef.current = {q, condition, phase, status, hasSearched};
    });

    const runSearch = (
        qVal: string,
        condVal: string,
        phaseVal: string | null,
        statusVal: string | null,
        pageVal: number,
    ) => {
        setLoading(true);
        setError("");
        searchTrials({
            q: qVal,
            condition: condVal,
            phase: phaseVal,
            status: statusVal,
            page: pageVal,
            limit: PAGE_SIZE,
        })
            .then((data) => {
                setResponse(data);
                setHasSearched(true);
            })
            .catch((e: unknown) => {
                setError(e instanceof Error ? e.message : "Search failed");
            })
            .finally(() => setLoading(false));
    };

    // Debounce text inputs; immediate for chips/pagination
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setPage(1);
            runSearch(q, condition, phase, status, 1);
        }, 350);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [q, condition, phase, status]);

    // Immediate re-run on page change — reads from ref to avoid dep conflicts
    useEffect(() => {
        const {q: qV, condition: cV, phase: phV, status: stV, hasSearched: hs} = latestRef.current;
        if (!hs) return;
        queueMicrotask(() => runSearch(qV, cV, phV, stV, page));
    }, [page]);

    const handlePhaseToggle = (val: string) =>
        setPhase((prev) => (prev === val ? null : val));
    const handleStatusToggle = (val: string) =>
        setStatus((prev) => (prev === val ? null : val));

    const handleCardClick = (trialId: string) => {
        setLoadingTrialId(trialId);
        fetchTrialDetail(trialId)
            .then((data) => setSelectedDetail(data))
            .catch(() => setSelectedDetail(null))
            .finally(() => setLoadingTrialId(null));
    };

    const trials: TrialSearchResult[] = response?.trials ?? [];
    const total = response?.total ?? 0;
    const pages = response?.pages ?? 1;

    return (
        <div className="space-y-6">
            {/* ── Mode switcher ──────────────────────────────────────────────── */}
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl w-fit">
                {(["trials", "medications"] as const).map((m) => (
                    <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                            mode === m
                                ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
                                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        }`}
                    >
                        {m === "trials"
                            ? <Microscope className="w-3.5 h-3.5"/>
                            : <FlaskConical className="w-3.5 h-3.5"/>}
                        {m === "trials" ? "By Trial" : "By Medication"}
                    </button>
                ))}
            </div>

            {/* ── Medication mode ────────────────────────────────────────────── */}
            {mode === "medications" && <MedicationExplorer/>}

            {/* ── Trial mode ─────────────────────────────────────────────────── */}
            {mode === "trials" && (
                <>
                    {/* Search controls */}
                    <div
                        className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm space-y-5">
                        <div className="relative">
                            <Search
                                className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
                            <input
                                type="text"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search trial titles…"
                                className="w-full pl-11 pr-4 py-3 text-sm bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-400 dark:focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 placeholder:text-slate-400"
                            />
                        </div>

                        <div className="relative">
                            <SlidersHorizontal
                                className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
                            <input
                                type="text"
                                value={condition}
                                onChange={(e) => setCondition(e.target.value)}
                                placeholder="Filter by condition (e.g. diabetes)"
                                className="w-full pl-11 pr-4 py-3 text-sm bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-400 dark:focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 placeholder:text-slate-400"
                            />
                        </div>

                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span
                                    className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 w-14">Phase</span>
                                {PHASE_OPTIONS.map((opt) => (
                                    <FilterChip
                                        key={opt.value}
                                        label={opt.label}
                                        active={phase === opt.value}
                                        onClick={() => handlePhaseToggle(opt.value)}
                                    />
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span
                                    className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 w-14">Status</span>
                                {STATUS_OPTIONS.map((opt) => (
                                    <FilterChip
                                        key={opt.value}
                                        label={opt.label}
                                        active={status === opt.value}
                                        onClick={() => handleStatusToggle(opt.value)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Results count */}
                    <AnimatePresence>
                        {error && <ErrorBanner message={error}/>}
                    </AnimatePresence>

                    {!loading && hasSearched && (
                        <motion.p
                            initial={{opacity: 0}}
                            animate={{opacity: 1}}
                            className="text-xs text-slate-400 dark:text-slate-500 px-1"
                        >
                            {total === 0
                                ? "No trials matched your filters."
                                : `${total} trial${total !== 1 ? "s" : ""} found — page ${page} of ${pages}`}
                        </motion.p>
                    )}

                    {/* Results */}
                    <AnimatePresence mode="wait">
                        {!hasSearched && !loading && (
                            <motion.div key="empty" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}>
                                <EmptyState
                                    icon={<Microscope className="w-14 h-14"/>}
                                    title="Browse all clinical trials"
                                    subtitle="Type a keyword, pick a phase or status filter — results appear automatically"
                                />
                            </motion.div>
                        )}

                        {loading && (
                            <motion.div key="loading" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                                        className="space-y-3">
                                {Array.from({length: 6}).map((_, i) => (
                                    <Skeleton key={i} className="h-28"/>
                                ))}
                            </motion.div>
                        )}

                        {!loading && hasSearched && trials.length > 0 && (
                            <motion.div key="results" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                                        className="space-y-3">
                                {trials.map((trial, i) => (
                                    <TrialSearchCard
                                        key={trial.trial_id}
                                        trial={trial}
                                        index={i}
                                        onClick={() => handleCardClick(trial.trial_id)}
                                        isLoading={loadingTrialId === trial.trial_id}
                                    />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Pagination */}
                    {!loading && pages > 1 && (
                        <motion.div
                            initial={{opacity: 0}}
                            animate={{opacity: 1}}
                            className="flex items-center justify-center gap-3 pt-2"
                        >
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                            >
                                <ChevronLeft className="w-3.5 h-3.5"/>
                                Previous
                            </button>
                            <span className="text-xs text-slate-400 font-medium tabular-nums">
                                {page} / {pages}
                            </span>
                            <button
                                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                                disabled={page === pages}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                            >
                                Next
                                <ChevronRight className="w-3.5 h-3.5"/>
                            </button>
                        </motion.div>
                    )}

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
            )}
        </div>
    );
}
