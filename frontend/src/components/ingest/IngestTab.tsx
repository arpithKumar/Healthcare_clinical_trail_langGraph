"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Database, RefreshCw, Clock, CheckCircle2 } from "lucide-react";
import { ingestTrial, triggerSeed, getSeedStatus } from "@/lib/api";
import type { IngestionResponse } from "@/types";
import { IngestForm } from "./IngestForm";
import { IngestionResult } from "./IngestionResult";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Skeleton } from "@/components/ui/Skeleton";

export function IngestTab() {
  const [text, setText] = useState("");
  const [trialId, setTrialId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestionResponse | null>(null);
  const [error, setError] = useState("");

  // Scheduler state
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedTriggered, setSeedTriggered] = useState(false);

  useEffect(() => {
    getSeedStatus()
      .then((s) => setNextRun(s.next_run))
      .catch(() => setNextRun(null));
  }, []);

  const handleIngest = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(await ingestTrial(text, trialId.trim() || undefined));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleSeedNow = async () => {
    setSeeding(true);
    setSeedTriggered(false);
    try {
      await triggerSeed();
      setSeedTriggered(true);
      // Refresh next-run time after a short delay
      setTimeout(() => {
        getSeedStatus()
          .then((s) => setNextRun(s.next_run))
          .catch(() => null);
      }, 500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to trigger seed");
    } finally {
      setSeeding(false);
    }
  };

  const formattedNextRun = nextRun
    ? new Date(nextRun).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="space-y-6">
      {/* ── Auto-seed scheduler panel ────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 px-5 py-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10">
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Auto-seed
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              {formattedNextRun ? (
                <>
                  Next scheduled run:{" "}
                  <span className="font-semibold text-indigo-500">
                    {formattedNextRun}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">Scheduler not running</span>
              )}
            </p>
          </div>
        </div>

        <motion.button
          onClick={handleSeedNow}
          disabled={seeding}
          whileTap={{ scale: 0.97 }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
            seedTriggered
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
              : "bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/60"
          }`}
        >
          {seeding ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : seedTriggered ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {seeding ? "Triggering…" : seedTriggered ? "Triggered!" : "Seed Now"}
        </motion.button>
      </div>

      {/* ── Manual ingest grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-4 lg:sticky lg:top-28 space-y-4">
          <IngestForm
            text={text}
            trialId={trialId}
            onTextChange={setText}
            onTrialIdChange={setTrialId}
            onSubmit={handleIngest}
            loading={loading}
          />
          <AnimatePresence>
            {error && <ErrorBanner message={error} />}
          </AnimatePresence>
        </div>

        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {!result && !loading && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <EmptyState
                  icon={<Database className="w-14 h-14" />}
                  title="No trial ingested yet"
                  subtitle="Paste clinical trial text and click Ingest Trial"
                />
              </motion.div>
            )}
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <Skeleton className="h-16" />
                <Skeleton className="h-24" />
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-36" />
                  <Skeleton className="h-36" />
                  <Skeleton className="h-36" />
                  <Skeleton className="h-36" />
                </div>
              </motion.div>
            )}
            {result && !loading && (
              <motion.div
                key="result"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <IngestionResult result={result} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
