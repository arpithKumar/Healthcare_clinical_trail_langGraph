"use client";

import {useState, useEffect, ReactNode} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FlaskConical, Dna, Pill, TrendingUp, Activity, Search, ArrowRight } from "lucide-react";
import { fetchGraphStats, fetchConditions } from "@/lib/api";
import type { GraphStats, DistributionItem, ConditionStat } from "@/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

// ── Label maps ────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  PHASE1: "Phase I",
  PHASE2: "Phase II",
  PHASE3: "Phase III",
  PHASE4: "Phase IV",
};

const PHASE_COLORS: Record<string, string> = {
  PHASE1: "bg-violet-500",
  PHASE2: "bg-indigo-500",
  PHASE3: "bg-sky-500",
  PHASE4: "bg-emerald-500",
};

const STATUS_LABELS: Record<string, string> = {
  RECRUITING: "Recruiting",
  ACTIVE_NOT_RECRUITING: "Active",
  COMPLETED: "Completed",
};

const STATUS_COLORS: Record<string, string> = {
  RECRUITING: "bg-emerald-500",
  ACTIVE_NOT_RECRUITING: "bg-blue-500",
  COMPLETED: "bg-slate-400",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
  delay,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm"
    >
      <div className={`inline-flex p-2.5 rounded-xl ${color} mb-4`}>
        {icon}
      </div>
      <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
        {label}
      </p>
    </motion.div>
  );
}

function HorizontalBar({
  label,
  sublabel,
  value,
  max,
  barClass,
  delay,
}: {
  label: string;
  sublabel?: string;
  value: number;
  max: number;
  barClass: string;
  delay: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay }}
      className="flex items-center gap-3"
    >
      <div className="w-36 shrink-0 text-right">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
          {label}
        </p>
        {sublabel && (
          <p className="font-mono text-[10px] text-slate-400">{sublabel}</p>
        )}
      </div>
      <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, delay: delay + 0.1, ease: "easeOut" }}
          className={`h-full rounded-full ${barClass}`}
        />
      </div>
      <span className="w-8 text-right text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400">
        {value}
      </span>
    </motion.div>
  );
}

function ChartCard({
  title,
  icon,
  children,
  delay,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-5">
        <span className="text-slate-400">{icon}</span>
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {title}
        </h3>
      </div>
      <div className="space-y-3">{children}</div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DashboardTabProps {
  onFindTrials?: (condition: string) => void;
}

export function DashboardTab({ onFindTrials }: DashboardTabProps) {
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Condition explorer state
  const [conditions, setConditions] = useState<ConditionStat[]>([]);
  const [condLoading, setCondLoading] = useState(true);
  const [condStatusFilter, setCondStatusFilter] = useState<string | null>(null);
  const [condSearch, setCondSearch] = useState("");

  useEffect(() => {
    fetchGraphStats()
      .then((data) => setStats(data))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load stats");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setCondLoading(true);
    fetchConditions(condStatusFilter ?? undefined)
      .then((data) => setConditions(data))
      .catch(() => setConditions([]))
      .finally(() => setCondLoading(false));
  }, [condStatusFilter]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
        <Skeleton className="h-96" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) return <ErrorBanner message={error} />;
  if (!stats) return null;

  const maxConditionTrials = Math.max(
    1,
    ...stats.top_conditions.map((c) => c.trial_count),
  );
  const maxPhase = Math.max(1, ...stats.phase_distribution.map((d) => d.count));
  const maxStatus = Math.max(
    1,
    ...stats.status_distribution.map((d) => d.count),
  );

  return (
    <div className="space-y-6">
      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<FlaskConical className="w-5 h-5 text-indigo-600" />}
          label="Clinical Trials"
          value={stats.trial_count}
          color="bg-indigo-500/10"
          delay={0}
        />
        <StatCard
          icon={<Dna className="w-5 h-5 text-rose-500" />}
          label="Conditions"
          value={stats.condition_count}
          color="bg-rose-500/10"
          delay={0.05}
        />
        <StatCard
          icon={<Pill className="w-5 h-5 text-sky-500" />}
          label="Medications"
          value={stats.medication_count}
          color="bg-sky-500/10"
          delay={0.1}
        />
      </div>

      {/* ── Top conditions ─────────────────────────────────────────────────── */}
      <ChartCard
        title="Top Conditions by Trial Count"
        icon={<TrendingUp className="w-4 h-4" />}
        delay={0.15}
      >
        {stats.top_conditions.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No condition data yet.</p>
        ) : (
          stats.top_conditions.map((c, i) => (
            <HorizontalBar
              key={c.name}
              label={c.name}
              sublabel={c.icd10_code ?? undefined}
              value={c.trial_count}
              max={maxConditionTrials}
              barClass="bg-rose-500"
              delay={0.18 + i * 0.03}
            />
          ))
        )}
      </ChartCard>

      {/* ── Phase + Status distribution ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Phase Distribution"
          icon={<FlaskConical className="w-4 h-4" />}
          delay={0.2}
        >
          {stats.phase_distribution.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No phase data yet.</p>
          ) : (
            stats.phase_distribution.map((d: DistributionItem, i) => (
              <HorizontalBar
                key={d.label}
                label={PHASE_LABELS[d.label] ?? d.label}
                value={d.count}
                max={maxPhase}
                barClass={PHASE_COLORS[d.label] ?? "bg-slate-500"}
                delay={0.22 + i * 0.04}
              />
            ))
          )}
        </ChartCard>

        <ChartCard
          title="Status Distribution"
          icon={<Activity className="w-4 h-4" />}
          delay={0.25}
        >
          {stats.status_distribution.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No status data yet.</p>
          ) : (
            stats.status_distribution.map((d: DistributionItem, i) => (
              <HorizontalBar
                key={d.label}
                label={STATUS_LABELS[d.label] ?? d.label}
                value={d.count}
                max={maxStatus}
                barClass={STATUS_COLORS[d.label] ?? "bg-slate-500"}
                delay={0.27 + i * 0.04}
              />
            ))
          )}
        </ChartCard>
      </div>

      {/* ── Condition trend explorer ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm"
      >
        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-slate-400"><Dna className="w-4 h-4" /></span>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Condition Trend Explorer
            </h3>
          </div>

          {/* Status filter chips */}
          <div className="flex items-center gap-2 shrink-0">
            {(["All", "RECRUITING"] as const).map((val) => {
              const active = val === "All" ? condStatusFilter === null : condStatusFilter === val;
              return (
                <button
                  key={val}
                  onClick={() => setCondStatusFilter(val === "All" ? null : val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 ${
                    active
                      ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-500 dark:text-indigo-400"
                      : "bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  {val === "RECRUITING" ? "Recruiting only" : "All trials"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search input */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={condSearch}
            onChange={(e) => setCondSearch(e.target.value)}
            placeholder="Filter conditions…"
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-400 dark:focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 placeholder:text-slate-400"
          />
        </div>

        {/* Condition cards grid */}
        {condLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={condStatusFilter ?? "all"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            >
              {conditions
                .filter((c) =>
                  condSearch.trim()
                    ? c.name.toLowerCase().includes(condSearch.toLowerCase())
                    : true,
                )
                .map((c, i) => (
                  <motion.div
                    key={c.name}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.02 }}
                    className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/50 hover:border-rose-300 dark:hover:border-rose-800 transition-colors duration-150"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-snug truncate">
                        {c.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {c.icd10_code && (
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {c.icd10_code}
                          </span>
                        )}
                        <span className="text-[10px] font-semibold text-rose-500">
                          {c.trial_count} trial{c.trial_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    {onFindTrials && (
                      <button
                        onClick={() => onFindTrials(c.name)}
                        title="Browse trials for this condition"
                        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border border-indigo-500/25 bg-indigo-500/8 text-indigo-500 dark:text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/50 transition-all duration-150"
                      >
                        Find Trials
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </motion.div>
                ))}
              {conditions.filter((c) =>
                condSearch.trim()
                  ? c.name.toLowerCase().includes(condSearch.toLowerCase())
                  : true,
              ).length === 0 && (
                <p className="col-span-full text-xs text-slate-400 italic text-center py-6">
                  No conditions match your search.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
}
