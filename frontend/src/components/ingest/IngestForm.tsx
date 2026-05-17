"use client";

import { Upload } from "lucide-react";

interface IngestFormProps {
  text: string;
  trialId: string;
  onTextChange: (v: string) => void;
  onTrialIdChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function IngestForm({
  text,
  trialId,
  onTextChange,
  onTrialIdChange,
  onSubmit,
  loading,
}: IngestFormProps) {
  return (
    <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
        Trial Ingestion
      </p>

      <div className="space-y-3">
        <input
          type="text"
          value={trialId}
          onChange={(e) => onTrialIdChange(e.target.value)}
          disabled={loading}
          placeholder="Trial ID  (optional — auto-generated)"
          className="w-full px-4 py-3 text-sm font-mono bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-400 dark:focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 placeholder:text-slate-400 placeholder:font-sans"
        />
        <textarea
          rows={9}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          disabled={loading}
          placeholder="Paste raw clinical trial text — title, description, eligibility criteria, exclusion criteria..."
          className="w-full p-4 text-sm bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-2xl resize-none outline-none focus:border-indigo-400 dark:focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 placeholder:text-slate-400"
        />
      </div>

      <button
        onClick={onSubmit}
        disabled={loading || !text.trim()}
        className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm text-white bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        {loading ? "Extracting & Ingesting..." : "Ingest Trial"}
      </button>
    </div>
  );
}
