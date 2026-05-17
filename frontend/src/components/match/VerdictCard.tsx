import { Sparkles } from "lucide-react";

export function VerdictCard({ verdict }: { verdict: string }) {
  return (
    <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-8 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
          <Sparkles className="w-4 h-4 text-indigo-500" />
        </div>
        <h2 className="font-bold text-slate-800 dark:text-slate-100">
          Clinical Intelligence
        </h2>
      </div>
      <div className="border-l-2 border-indigo-200 dark:border-indigo-800 pl-4 space-y-2">
        {verdict
          .split("\n")
          .filter(Boolean)
          .map((line, i) => (
            <p
              key={i}
              className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed"
            >
              {line}
            </p>
          ))}
      </div>
    </div>
  );
}
