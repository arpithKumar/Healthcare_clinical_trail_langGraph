"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  Download,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  LayoutList,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { matchPatientsBatch } from "@/lib/api";
import type { BatchMatchResult } from "@/types";

const CSV_EXAMPLE = `profile
45yo female with hypertension and Type 2 Diabetes
67yo male with Parkinson's disease currently on Levodopa
32yo female with severe asthma on Albuterol`;

export function BatchUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<BatchMatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setResults([]);
    setError("");
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const data = await matchPatientsBatch(file);
      setResults(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    const headers = [
      "row",
      "profile",
      "total_matches",
      "top_trial_id",
      "top_trial_title",
      "top_score",
      "error",
    ];
    const rows = results.map((r) =>
      [
        r.row,
        `"${r.profile.replace(/"/g, '""')}"`,
        r.total_matches,
        r.top_trial_id ?? "",
        `"${(r.top_trial_title ?? "").replace(/"/g, '""')}"`,
        r.top_score ?? "",
        r.error ? `"${r.error.replace(/"/g, '""')}"` : "",
      ].join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "batch_match_results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const successCount = results.filter((r) => !r.error).length;
  const errorCount = results.filter((r) => r.error).length;

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-4 py-16 px-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
          dragOver
            ? "border-indigo-500 bg-indigo-500/5"
            : file
              ? "border-emerald-500/50 bg-emerald-500/5"
              : "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:border-indigo-400 hover:bg-indigo-500/5"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {file ? (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {file.name}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {(file.size / 1024).toFixed(1)} KB · Click to replace
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 text-slate-400" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Drop a CSV file here
              </p>
              <p className="text-xs text-slate-400 mt-1">
                or click to browse · max 50 rows
              </p>
            </div>
          </>
        )}
      </div>

      {/* Format hint */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-slate-400" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Expected CSV format
          </p>
        </div>
        <pre className="text-[11px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
          {CSV_EXAMPLE}
        </pre>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Matching patients… this may take several minutes
          </>
        ) : (
          <>
            <LayoutList className="w-4 h-4" />
            Match All Patients
          </>
        )}
      </button>

      {/* Results */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Summary bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  {results.length} patient{results.length !== 1 ? "s" : ""}{" "}
                  processed
                </span>
                {successCount > 0 && (
                  <span className="text-emerald-500 font-semibold">
                    {successCount} matched
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="text-rose-400 font-semibold">
                    {errorCount} failed
                  </span>
                )}
              </div>
              <button
                onClick={downloadCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-indigo-400 border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                    {[
                      "#",
                      "Patient Profile",
                      "Matches",
                      "Top Trial",
                      "Score",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {results.map((r) => (
                    <tr
                      key={r.row}
                      className={`transition-colors ${
                        r.error
                          ? "bg-rose-500/5"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      }`}
                    >
                      <td className="px-4 py-3 text-[11px] font-mono text-slate-400 shrink-0">
                        {r.row}
                      </td>
                      <td className="px-4 py-3 max-w-55">
                        <p className="text-[12px] text-slate-700 dark:text-slate-300 line-clamp-2">
                          {r.profile}
                        </p>
                        {r.error && (
                          <p className="text-[11px] text-rose-400 mt-1">
                            {r.error}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-[12px] font-bold ${
                            r.total_matches > 0
                              ? "text-emerald-500"
                              : "text-slate-400"
                          }`}
                        >
                          {r.total_matches}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-50">
                        {r.top_trial_id ? (
                          <div>
                            <p className="text-[11px] font-mono text-slate-400">
                              {r.top_trial_id}
                            </p>
                            <p className="text-[12px] text-slate-600 dark:text-slate-300 line-clamp-1 mt-0.5">
                              {r.top_trial_title}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.top_score != null ? (
                          <span
                            className={`text-[12px] font-bold tabular-nums ${
                              r.top_score >= 80
                                ? "text-emerald-500"
                                : r.top_score >= 50
                                  ? "text-amber-400"
                                  : "text-rose-400"
                            }`}
                          >
                            {r.top_score}%
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
