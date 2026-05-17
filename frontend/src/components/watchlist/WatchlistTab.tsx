"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookMarked, Play, Loader2 } from "lucide-react";
import { getWatchlist, deleteFromWatchlist, runWatchlist } from "@/lib/api";
import type { WatchlistProfile, WatchlistRunResult } from "@/types";
import { WatchlistCard } from "./WatchlistCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

export function WatchlistTab() {
  const [profiles, setProfiles] = useState<WatchlistProfile[]>([]);
  const [runResults, setRunResults] = useState<Map<string, WatchlistRunResult>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getWatchlist()
      .then((data) => {
        if (!cancelled) setProfiles(data);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRunAll = async () => {
    setRunning(true);
    setError("");
    try {
      const results = await runWatchlist();
      const map = new Map<string, WatchlistRunResult>();
      results.forEach((r) => map.set(r.profile_id, r));
      setRunResults(map);
      // Refresh profiles so last_trial_ids counts update
      const refreshed = await getWatchlist();
      setProfiles(refreshed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFromWatchlist(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      setRunResults((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const newMatchCount = Array.from(runResults.values()).reduce(
    (acc, r) => acc + r.new_matches.length,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Saved Profiles
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {profiles.length} profile{profiles.length !== 1 ? "s" : ""} saved
            {newMatchCount > 0 && (
              <span className="ml-2 text-amber-500 font-semibold">
                · {newMatchCount} new match{newMatchCount !== 1 ? "es" : ""}{" "}
                found
              </span>
            )}
          </p>
        </div>

        <button
          onClick={handleRunAll}
          disabled={running || profiles.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {running ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {running ? "Running…" : "Run All"}
        </button>
      </div>

      <AnimatePresence>
        {error && <ErrorBanner message={error} />}
      </AnimatePresence>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : profiles.length === 0 ? (
        <EmptyState
          icon={<BookMarked className="w-14 h-14" />}
          title="No saved profiles"
          subtitle='Run a patient match and click "Save to Watchlist" to track it here'
        />
      ) : (
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {profiles.map((profile) => (
              <WatchlistCard
                key={profile.id}
                profile={profile}
                runResult={runResults.get(profile.id)}
                onDelete={handleDelete}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
