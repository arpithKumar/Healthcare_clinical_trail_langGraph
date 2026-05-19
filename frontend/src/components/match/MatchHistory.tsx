"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { History, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { fetchMatchHistory } from "@/lib/api";
import type { MatchHistoryItem } from "@/types";
import { timeAgo } from "@/lib/utils";

interface MatchHistoryProps {
  refreshKey: number;
  onRerun: (profile: string) => void;
}

export function MatchHistory({ refreshKey, onRerun }: MatchHistoryProps) {
  const [items, setItems] = useState<MatchHistoryItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchMatchHistory(10)
      .then((data) => setItems(data))
      .catch(() => setItems([]));
  }, [refreshKey]);

  if (items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors duration-150"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Recent Searches
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 tabular-nums">
            {items.length}
          </span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors duration-100"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                      {item.profile}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-slate-400">
                        {timeAgo(item.created_at)}
                      </span>
                      {item.total_matches > 0 && (
                        <span className="text-[10px] text-slate-400">
                          · {item.total_matches} match{item.total_matches !== 1 ? "es" : ""}
                        </span>
                      )}
                      {item.top_score !== null && (
                        <span className="text-[10px] font-semibold text-emerald-500">
                          · top score {item.top_score}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => onRerun(item.profile)}
                    title="Re-run this search"
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 transition-all duration-150"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Re-run
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
