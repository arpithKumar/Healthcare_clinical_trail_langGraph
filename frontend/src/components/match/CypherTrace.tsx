"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Database, ChevronDown, ChevronUp } from "lucide-react";

export function CypherTrace({ cypher }: { cypher: string | null }) {
  const [open, setOpen] = useState(false);
  if (!cypher) return null;

  return (
    <div className="border-t border-slate-100 dark:border-slate-800/60 pt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-500 transition-colors"
      >
        <Database className="w-3 h-3" />
        Database Trace
        {open ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mt-3"
          >
            <pre className="p-4 bg-slate-950 text-emerald-400 text-xs font-mono rounded-xl border border-slate-800 whitespace-pre-wrap break-all leading-relaxed">
              {cypher}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
