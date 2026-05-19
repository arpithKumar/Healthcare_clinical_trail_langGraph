"use client";

import {useState, useCallback, useEffect} from "react";
import {motion, AnimatePresence} from "framer-motion";
import {
    ClipboardList,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    XCircle,
    AlertTriangle,
} from "lucide-react";
import {fetchPendingReviews, approvePendingReview, rejectPendingReview} from "@/lib/api";
import type {PendingReviewItem} from "@/types";

function ConfidenceBadge({score}: {score: number}) {
    const pct = Math.round(score * 100);
    const color =
        score >= 0.6
            ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/30"
            : score >= 0.4
                ? "text-amber-600 bg-amber-500/10 border-amber-500/30"
                : "text-rose-600 bg-rose-500/10 border-rose-500/30";
    return (
        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${color}`}>
            {pct}% confidence
        </span>
    );
}

function ReviewCard({
    item,
    onApprove,
    onReject,
}: {
    item: PendingReviewItem;
    onApprove: () => Promise<void>;
    onReject: () => Promise<void>;
}) {
    const [expanded, setExpanded] = useState(false);
    const [busy, setBusy] = useState(false);

    let parsed: {
        trial_title?: string;
        conditions_treated?: {name: string}[];
        medications_used?: {name: string}[];
    } | null = null;
    try {
        parsed = JSON.parse(item.extracted_json);
    } catch {
        /* ignore */
    }

    const handle = async (fn: () => Promise<void>) => {
        setBusy(true);
        try {
            await fn();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-900/10 overflow-hidden">
            <div className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {item.trial_title}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-slate-400">{item.trial_id}</span>
                        <ConfidenceBadge score={item.confidence}/>
                        <span className="text-xs text-slate-400">
                            {new Date(item.created_at).toLocaleDateString()}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        onClick={() => handle(onApprove)}
                        disabled={busy}
                        title="Approve — ingest to knowledge graph"
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5"/>
                        Approve
                    </button>
                    <button
                        onClick={() => handle(onReject)}
                        disabled={busy}
                        title="Reject — discard this extraction"
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 disabled:opacity-40 transition-colors"
                    >
                        <XCircle className="w-3.5 h-3.5"/>
                        Reject
                    </button>
                    {parsed && (
                        <button
                            onClick={() => setExpanded((v) => !v)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                        >
                            {expanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                        </button>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {expanded && parsed && (
                    <motion.div
                        initial={{height: 0, opacity: 0}}
                        animate={{height: "auto", opacity: 1}}
                        exit={{height: 0, opacity: 0}}
                        className="overflow-hidden border-t border-amber-200 dark:border-amber-800/50"
                    >
                        <div className="px-4 py-3 space-y-2">
                            {(parsed.conditions_treated ?? []).length > 0 && (
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                                        Conditions
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {(parsed.conditions_treated ?? []).map((c) => (
                                            <span key={c.name}
                                                className="px-2 py-0.5 rounded-md text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
                                                {c.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {(parsed.medications_used ?? []).length > 0 && (
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                                        Medications
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {(parsed.medications_used ?? []).map((m) => (
                                            <span key={m.name}
                                                className="px-2 py-0.5 rounded-md text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800">
                                                {m.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function ReviewQueue() {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<PendingReviewItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(() => {
        setLoading(true);
        fetchPendingReviews()
            .then((data) => setItems(data))
            .catch((e: unknown) =>
                setError(e instanceof Error ? e.message : "Failed to load review queue"),
            )
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        queueMicrotask(() => load());
    }, [load]);

    const handleApprove = async (id: string) => {
        await approvePendingReview(id);
        setItems((prev) => prev.filter((r) => r.id !== id));
    };

    const handleReject = async (id: string) => {
        await rejectPendingReview(id);
        setItems((prev) => prev.filter((r) => r.id !== id));
    };

    if (!loading && items.length === 0 && !open) return null;

    return (
        <div className="rounded-2xl bg-white dark:bg-slate-900/80 border border-amber-200/60 dark:border-amber-800/40 shadow-sm overflow-hidden">
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/10">
                        <AlertTriangle className="w-4 h-4 text-amber-500"/>
                    </div>
                    <div className="text-left">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            Review Queue
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                            {loading
                                ? "Loading…"
                                : items.length > 0
                                    ? `${items.length} trial${items.length !== 1 ? "s" : ""} awaiting human review`
                                    : "No items awaiting review"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {items.length > 0 && (
                        <span className="px-2.5 py-0.5 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            {items.length}
                        </span>
                    )}
                    <ClipboardList className="w-4 h-4 text-slate-400"/>
                    {open ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
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
                        <div className="px-5 pb-5 space-y-2 border-t border-amber-200 dark:border-amber-800/50 pt-4">
                            {error && (
                                <p className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-900/20 rounded-xl px-3 py-2">
                                    {error}
                                </p>
                            )}
                            {items.length === 0 && !loading && (
                                <p className="text-sm text-slate-400 text-center py-4">
                                    All extractions met the confidence threshold ✓
                                </p>
                            )}
                            {items.map((item) => (
                                <ReviewCard
                                    key={item.id}
                                    item={item}
                                    onApprove={() => handleApprove(item.id)}
                                    onReject={() => handleReject(item.id)}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
