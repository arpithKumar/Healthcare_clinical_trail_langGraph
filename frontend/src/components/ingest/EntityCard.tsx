import type { ReactNode } from "react";

const colorMap = {
  indigo:
    "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-100 dark:border-indigo-800/50",
  violet:
    "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-100 dark:border-violet-800/50",
  rose: "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-800/50",
  amber:
    "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800/50",
} as const;

const badgeMap = {
  indigo:
    "bg-indigo-200/60 dark:bg-indigo-700/40 text-indigo-600 dark:text-indigo-300",
  violet:
    "bg-violet-200/60 dark:bg-violet-700/40 text-violet-600 dark:text-violet-300",
  rose: "bg-rose-200/60 dark:bg-rose-700/40 text-rose-600 dark:text-rose-300",
  amber:
    "bg-amber-200/60 dark:bg-amber-700/40 text-amber-600 dark:text-amber-300",
} as const;

type Color = keyof typeof colorMap;

export interface EntityItem {
  name: string;
  icd10_code?: string | null;
}

interface EntityCardProps {
  icon: ReactNode;
  label: string;
  items: EntityItem[];
  color: Color;
}

export function EntityCard({ icon, label, items, color }: EntityCardProps) {
  return (
    <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg border ${colorMap[color]}`}>
          {icon}
        </div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {label}
        </h3>
      </div>

      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item.name}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg capitalize border ${colorMap[color]}`}
            >
              {item.name}
              {item.icd10_code && (
                <span
                  className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded tracking-wider ${badgeMap[color]}`}
                  title={`ICD-10: ${item.icd10_code}`}
                >
                  {item.icd10_code}
                </span>
              )}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">None extracted</p>
      )}
    </div>
  );
}
