import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-64 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
      <div className="mb-3 opacity-25">{icon}</div>
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
        {title}
      </p>
      {subtitle && <p className="text-xs mt-1 text-slate-400">{subtitle}</p>}
    </div>
  );
}
