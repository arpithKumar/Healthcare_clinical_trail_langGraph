import {
  CheckCircle2,
  FlaskConical,
  Pill,
  ShieldX,
  ClipboardList,
} from "lucide-react";
import { motion } from "framer-motion";
import type { IngestionResponse } from "@/types";
import { EntityCard } from "./EntityCard";

export function IngestionResult({ result }: { result: IngestionResponse }) {
  const { extracted_entities: e, trial_id } = result;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Success banner */}
      <div className="flex items-center gap-4 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-2xl">
        <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
            Successfully ingested into Neo4j
          </p>
          <p className="text-xs font-mono text-emerald-600/60 dark:text-emerald-500/60 mt-0.5">
            {trial_id}
          </p>
        </div>
      </div>

      {/* Trial summary */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
          Extracted Title
        </p>
        <p className="font-bold text-slate-800 dark:text-slate-100 leading-snug">
          {e.trial_title}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {e.eligibility.min_age != null && (
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              Age {e.eligibility.min_age}–{e.eligibility.max_age ?? "∞"}
            </span>
          )}
          {e.eligibility.gender && (
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {e.eligibility.gender}
            </span>
          )}
        </div>
      </div>

      {/* Entity grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EntityCard
          icon={<FlaskConical className="w-3.5 h-3.5" />}
          label="Conditions Treated"
          items={e.conditions_treated.map((c) => ({
            name: c.name,
            icd10_code: c.icd10_code,
          }))}
          color="indigo"
        />
        <EntityCard
          icon={<Pill className="w-3.5 h-3.5" />}
          label="Medications Used"
          items={e.medications_used.map((m) => ({ name: m.name }))}
          color="violet"
        />
        <EntityCard
          icon={<ShieldX className="w-3.5 h-3.5" />}
          label="Excluded Conditions"
          items={e.conditions_excluded.map((c) => ({
            name: c.name,
            icd10_code: c.icd10_code,
          }))}
          color="rose"
        />
        <EntityCard
          icon={<ClipboardList className="w-3.5 h-3.5" />}
          label="Excluded Medications"
          items={e.medications_excluded.map((m) => ({ name: m.name }))}
          color="amber"
        />
      </div>
    </motion.div>
  );
}
