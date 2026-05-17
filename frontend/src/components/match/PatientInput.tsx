"use client";

import { Activity, FileJson, FileText } from "lucide-react";

export type InputMode = "text" | "fhir";

const PHASE_OPTIONS = [
  { label: "Phase I", value: "PHASE1" },
  { label: "Phase II", value: "PHASE2" },
  { label: "Phase III", value: "PHASE3" },
  { label: "Phase IV", value: "PHASE4" },
] as const;

const STATUS_OPTIONS = [
  { label: "Recruiting", value: "RECRUITING" },
  { label: "Active", value: "ACTIVE_NOT_RECRUITING" },
  { label: "Completed", value: "COMPLETED" },
] as const;

interface PatientInputProps {
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  profile: string;
  onProfileChange: (v: string) => void;
  fhirJson: string;
  onFhirJsonChange: (v: string) => void;
  phase: string | null;
  onPhaseChange: (v: string | null) => void;
  status: string | null;
  onStatusChange: (v: string | null) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function PatientInput({
  mode,
  onModeChange,
  profile,
  onProfileChange,
  fhirJson,
  onFhirJsonChange,
  phase,
  onPhaseChange,
  status,
  onStatusChange,
  onSubmit,
  loading,
}: PatientInputProps) {
  const isFhir = mode === "fhir";
  const currentVal = isFhir ? fhirJson : profile;
  const canSubmit = !loading && currentVal.trim().length > 0;

  return (
    <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm space-y-4">
      {/* Header row: label + mode toggle */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Patient Profile
        </p>

        <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <ModeButton
            active={!isFhir}
            onClick={() => onModeChange("text")}
            icon={<FileText className="w-3 h-3" />}
            label="Free Text"
          />
          <ModeButton
            active={isFhir}
            onClick={() => onModeChange("fhir")}
            icon={<FileJson className="w-3 h-3" />}
            label="FHIR JSON"
          />
        </div>
      </div>

      {/* Textarea */}
      {isFhir ? (
        <div className="space-y-2">
          <textarea
            rows={10}
            value={fhirJson}
            onChange={(e) => onFhirJsonChange(e.target.value)}
            disabled={loading}
            spellCheck={false}
            className="w-full p-4 text-[11px] font-mono bg-slate-950 text-emerald-300 border border-slate-700 rounded-2xl resize-none outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 leading-relaxed"
          />
          <p className="text-[10px] text-slate-500 leading-relaxed px-1">
            Paste a FHIR R4 Bundle with{" "}
            <span className="font-mono text-slate-400">Patient</span> +{" "}
            <span className="font-mono text-slate-400">Condition</span>{" "}
            resources. Age is derived from{" "}
            <span className="font-mono text-slate-400">birthDate</span>.
          </p>
        </div>
      ) : (
        <textarea
          rows={6}
          value={profile}
          onChange={(e) => onProfileChange(e.target.value)}
          disabled={loading}
          placeholder="e.g. 55yo male with Type 2 Diabetes currently on Metformin..."
          className="w-full p-4 text-sm bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-2xl resize-none outline-none focus:border-indigo-400 dark:focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 placeholder:text-slate-400"
        />
      )}

      {/* Phase + Status filters — text mode only */}
      {!isFhir && (
        <div className="space-y-2.5">
          {/* Phase row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 w-12 shrink-0">
              Phase
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PHASE_OPTIONS.map((opt) => (
                <FilterChip
                  key={opt.value}
                  label={opt.label}
                  active={phase === opt.value}
                  disabled={loading}
                  onClick={() =>
                    onPhaseChange(phase === opt.value ? null : opt.value)
                  }
                />
              ))}
            </div>
          </div>

          {/* Status row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 w-12 shrink-0">
              Status
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {STATUS_OPTIONS.map((opt) => (
                <FilterChip
                  key={opt.value}
                  label={opt.label}
                  active={status === opt.value}
                  disabled={loading}
                  onClick={() =>
                    onStatusChange(status === opt.value ? null : opt.value)
                  }
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm text-white bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : isFhir ? (
          <FileJson className="w-4 h-4" />
        ) : (
          <Activity className="w-4 h-4" />
        )}
        {loading
          ? "Analyzing…"
          : isFhir
            ? "Match FHIR Patient"
            : "Find Matching Trials"}
      </button>
    </div>
  );
}

// ── Internal components ────────────────────────────────────────────────────────

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all duration-150 ${
        active
          ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
          : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FilterChip({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-indigo-500/15 border-indigo-500/50 text-indigo-500 dark:text-indigo-400"
          : "bg-transparent border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
      }`}
    >
      {label}
    </button>
  );
}
