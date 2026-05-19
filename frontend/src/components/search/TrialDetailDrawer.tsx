"use client";

import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  FlaskConical,
  Activity,
  CheckCircle2,
  XCircle,
  Pill,
  Users,
  CalendarDays,
  Loader2,
} from "lucide-react";
import { fetchEligibleProfile } from "@/lib/api";
import type { TrialDetail, TrialConditionDetail, EligibleProfileResponse } from "@/types";

const PHASE_STYLES: Record<string, string> = {
  PHASE1: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  PHASE2: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  PHASE3: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  PHASE4: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};
const PHASE_LABELS: Record<string, string> = {
  PHASE1: "Phase I", PHASE2: "Phase II", PHASE3: "Phase III", PHASE4: "Phase IV",
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

function ConditionChip({ cond }: { cond: TrialConditionDetail }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/8 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/15">
      {cond.name}
      {cond.icd10_code && (
        <span className="font-mono text-[10px] opacity-70">{cond.icd10_code}</span>
      )}
    </span>
  );
}

function MedChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-500/8 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/15">
      <Pill className="w-3 h-3 opacity-60" />
      {name}
    </span>
  );
}

function Section({
  title,
  icon,
  children,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  empty: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-slate-400">{icon}</span>
        <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {title}
        </h4>
      </div>
      {empty ? (
        <p className="text-xs text-slate-400 italic pl-1">None recorded</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">{children}</div>
      )}
    </div>
  );
}

interface TrialDetailDrawerProps {
  detail: TrialDetail;
  onClose: () => void;
}

export function TrialDetailDrawer({ detail, onClose }: TrialDetailDrawerProps) {
  const [reverseResult, setReverseResult] = useState<EligibleProfileResponse | null>(null);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseError, setReverseError] = useState("");

  const handleWhoFits = () => {
    if (reverseResult) {
      setReverseOpen((v) => !v);
      return;
    }
    setReverseLoading(true);
    setReverseError("");
    fetchEligibleProfile(detail.trial_id)
      .then((data) => {
        setReverseResult(data);
        setReverseOpen(true);
      })
      .catch((e: unknown) => {
        setReverseError(e instanceof Error ? e.message : "Failed to generate profile");
      })
      .finally(() => setReverseLoading(false));
  };

  const phaseLabel = detail.phase ? (PHASE_LABELS[detail.phase] ?? detail.phase) : null;
  const phaseStyle = detail.phase ? (PHASE_STYLES[detail.phase] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20") : null;
  const statusLabel = detail.status ? (STATUS_LABELS[detail.status] ?? detail.status) : null;
  const statusStyle = detail.status ? (STATUS_STYLES[detail.status] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20") : null;

  const ageRange = (() => {
    if (detail.min_age && detail.max_age) return `${detail.min_age} – ${detail.max_age} years`;
    if (detail.min_age) return `≥ ${detail.min_age} years`;
    if (detail.max_age) return `≤ ${detail.max_age} years`;
    return null;
  })();

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <motion.div
        key="drawer"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="fixed right-0 top-0 h-full w-full max-w-125 z-50 bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200/80 dark:border-slate-800/80">
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10px] text-slate-400 mb-1">{detail.trial_id}</p>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
              {detail.title || "Untitled Trial"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {phaseLabel && phaseStyle && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border ${phaseStyle}`}>
                <FlaskConical className="w-3.5 h-3.5" />
                {phaseLabel}
              </span>
            )}
            {statusLabel && statusStyle && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border ${statusStyle}`}>
                <Activity className="w-3.5 h-3.5" />
                {statusLabel}
              </span>
            )}
            {ageRange && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border bg-amber-500/10 text-amber-500 border-amber-500/20">
                <CalendarDays className="w-3.5 h-3.5" />
                {ageRange}
              </span>
            )}
          </div>

          {/* Inclusion sections */}
          <Section
            title="Conditions Treated"
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            empty={detail.conditions_treated.length === 0}
          >
            {detail.conditions_treated.map((c) => (
              <ConditionChip key={c.name} cond={c} />
            ))}
          </Section>

          <Section
            title="Medications Used"
            icon={<Pill className="w-3.5 h-3.5" />}
            empty={detail.medications_used.length === 0}
          >
            {detail.medications_used.map((m) => (
              <MedChip key={m} name={m} />
            ))}
          </Section>

          {/* Divider */}
          <div className="border-t border-slate-100 dark:border-slate-800" />

          {/* Exclusion sections */}
          <Section
            title="Excluded Conditions"
            icon={<XCircle className="w-3.5 h-3.5" />}
            empty={detail.conditions_excluded.length === 0}
          >
            {detail.conditions_excluded.map((c) => (
              <ConditionChip key={c.name} cond={c} />
            ))}
          </Section>

          <Section
            title="Excluded Medications"
            icon={<Pill className="w-3.5 h-3.5" />}
            empty={detail.medications_excluded.length === 0}
          >
            {detail.medications_excluded.map((m) => (
              <MedChip key={m} name={m} />
            ))}
          </Section>

          {/* Who fits? */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
            <button
              onClick={handleWhoFits}
              disabled={reverseLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-violet-500/30 bg-violet-500/8 text-violet-500 hover:bg-violet-500/15 hover:border-violet-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
            >
              {reverseLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Users className="w-4 h-4" />
              )}
              {reverseLoading
                ? "Generating…"
                : reverseOpen
                ? "Hide ideal profile"
                : "Who fits this trial?"}
            </button>

            <AnimatePresence>
              {reverseOpen && reverseResult && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 p-4 rounded-xl bg-violet-500/6 border border-violet-500/15 text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                >
                  {reverseResult.ideal_profile}
                </motion.div>
              )}
              {reverseError && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-2 text-xs text-rose-500"
                >
                  {reverseError}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </>
  );
}
