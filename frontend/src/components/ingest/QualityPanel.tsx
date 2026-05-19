"use client";

import {useState, useCallback} from "react";
import {motion, AnimatePresence} from "framer-motion";
import {
    ShieldCheck,
    ChevronDown,
    ChevronUp,
    RefreshCw,
    Wrench,
    AlertTriangle,
    CheckCircle2,
    XCircle,
} from "lucide-react";
import {fetchGraphQuality, fixMissingIcd10} from "@/lib/api";
import type {GraphQuality, QualityIssue} from "@/types";

function ScoreBadge({score}: {score: number}) {
    const color =
        score >= 80
            ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/30"
            : score >= 60
                ? "text-amber-500 bg-amber-500/10 border-amber-500/30"
                : "text-rose-500 bg-rose-500/10 border-rose-500/30";
    const Icon = score >= 80 ? CheckCircle2 : score >= 60 ? AlertTriangle : XCircle;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-sm font-bold border ${color}`}>
            <Icon className="w-4 h-4"/>
            {score}/100
        </span>
    );
}

function IssueRow({issue, onFix}: {issue: QualityIssue; onFix?: () => void}) {
    const [expanded, setExpanded] = useState(false);
    const ok = issue.count === 0;
    return (
        <div className={`rounded-xl border px-4 py-3 space-y-2 ${ok
            ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10"
            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    {ok
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0"/>
                        : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0"/>}
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {issue.label}
                    </span>
                    {!ok && (
                        <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            {issue.count}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {onFix && !ok && (
                        <button
                            onClick={onFix}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-500 hover:bg-indigo-500/20 transition-colors"
                        >
                            <Wrench className="w-3 h-3"/>
                            Fix
                        </button>
                    )}
                    {issue.items.length > 0 && !ok && (
                        <button
                            onClick={() => setExpanded((v) => !v)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                        >
                            {expanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                        </button>
                    )}
                </div>
            </div>
            <AnimatePresence>
                {expanded && issue.items.length > 0 && (
                    <motion.div
                        initial={{height: 0, opacity: 0}}
                        animate={{height: "auto", opacity: 1}}
                        exit={{height: 0, opacity: 0}}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {issue.items.map((item) => (
                                <span
                                    key={item}
                                    className="px-2 py-0.5 rounded-md text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                >
                                    {item}
                                </span>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function QualityPanel() {
    const [open, setOpen] = useState(false);
    const [quality, setQuality] = useState<GraphQuality | null>(null);
    const [loading, setLoading] = useState(false);
    const [fixing, setFixing] = useState(false);
    const [fixMsg, setFixMsg] = useState("");
    const [error, setError] = useState("");

    const load = useCallback(() => {
        setLoading(true);
        setError("");
        fetchGraphQuality()
            .then((data) => setQuality(data))
            .catch((e: unknown) =>
                setError(e instanceof Error ? e.message : "Failed to load quality report"),
            )
            .finally(() => setLoading(false));
    }, []);

    const handleToggle = () => {
        if (!open && !quality) load();
        setOpen((v) => !v);
    };

    const handleFixIcd10 = async () => {
        setFixing(true);
        setFixMsg("");
        try {
            const {fixed} = await fixMissingIcd10();
            setFixMsg(`Enriched ${fixed} condition${fixed !== 1 ? "s" : ""} with ICD-10 codes.`);
            load(); // refresh the panel
        } catch (e: unknown) {
            setFixMsg(e instanceof Error ? e.message : "Fix failed");
        } finally {
            setFixing(false);
        }
    };

    return (
        <div className="rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
            {/* Header — always visible */}
            <button
                onClick={handleToggle}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-emerald-500/10">
                        <ShieldCheck className="w-4 h-4 text-emerald-500"/>
                    </div>
                    <div className="text-left">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            Graph Health
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                            {quality
                                ? `${quality.total_trials} trials · health score ${quality.health_score}/100`
                                : "Audit the knowledge graph for data quality issues"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {quality && <ScoreBadge score={quality.health_score}/>}
                    {open
                        ? <ChevronUp className="w-4 h-4 text-slate-400"/>
                        : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                </div>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{height: 0}}
                        animate={{height: "auto"}}
                        exit={{height: 0}}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-5 space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
                            {/* Refresh button */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {quality && (
                                        <>
                                            <ScoreBadge score={quality.health_score}/>
                                            {quality.pending_reviews > 0 && (
                                                <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                                                    {quality.pending_reviews} awaiting review
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                                <button
                                    onClick={load}
                                    disabled={loading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 disabled:opacity-40 transition-all"
                                >
                                    <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`}/>
                                    Refresh
                                </button>
                            </div>

                            {fixMsg && (
                                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2">
                                    ✓ {fixMsg}
                                </p>
                            )}

                            {error && (
                                <p className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-900/20 rounded-xl px-3 py-2">
                                    {error}
                                </p>
                            )}

                            {loading && (
                                <div className="space-y-2">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse"/>
                                    ))}
                                </div>
                            )}

                            {!loading && quality && (
                                <div className="space-y-2">
                                    {quality.issues.map((issue) => (
                                        <IssueRow
                                            key={issue.type}
                                            issue={issue}
                                            onFix={
                                                issue.type === "missing_icd10"
                                                    ? (fixing ? undefined : handleFixIcd10)
                                                    : undefined
                                            }
                                        />
                                    ))}
                                </div>
                            )}

                            {fixing && (
                                <p className="text-xs text-slate-400 animate-pulse">
                                    Enriching conditions via NIH NLM API…
                                </p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
