"use client";

import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { ProgressEvent } from "@/types";

interface Props {
  events: ProgressEvent[];
  activeLabel: string | null;
}

export function StreamingProgress({ events, activeLabel }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 space-y-1">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-4">
        Agent Progress
      </p>

      <ol className="space-y-3">
        {/* Completed / errored nodes */}
        {events.map((ev, i) => (
          <motion.li
            key={`${ev.node}-${i}`}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-3"
          >
            {ev.status === "complete" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <span
              className={
                ev.status === "complete"
                  ? "text-sm text-zinc-200"
                  : "text-sm text-amber-300"
              }
            >
              {ev.label}
            </span>
          </motion.li>
        ))}

        {/* Currently active node */}
        {activeLabel && (
          <motion.li
            key="active"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-3"
          >
            <Loader2 className="w-5 h-5 text-indigo-400 shrink-0 animate-spin" />
            <span className="text-sm text-indigo-300">{activeLabel}</span>
          </motion.li>
        )}
      </ol>
    </div>
  );
}
