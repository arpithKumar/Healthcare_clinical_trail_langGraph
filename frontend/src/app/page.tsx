"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import type { Tab } from "@/components/layout/Navbar";
import { MatchTab } from "@/components/match/MatchTab";
import { IngestTab } from "@/components/ingest/IngestTab";
import { GraphTab } from "@/components/graph/GraphTab";
import { WatchlistTab } from "@/components/watchlist/WatchlistTab";

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function Home() {
  const [tab, setTab] = useState<Tab>("match");
  const [graphTrialIds, setGraphTrialIds] = useState<string[]>([]);

  const handleVisualize = (ids: string[]) => {
    setGraphTrialIds(ids);
    setTab("graph");
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20 transition-colors duration-300">
      <div className="bg-dot-grid min-h-screen">
        <Navbar tab={tab} onTabChange={setTab} />

        <main className="max-w-7xl mx-auto px-6 py-10">
          <AnimatePresence mode="wait">
            {tab === "match" && (
              <motion.div
                key="match"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <MatchTab onVisualize={handleVisualize} />
              </motion.div>
            )}
            {tab === "ingest" && (
              <motion.div
                key="ingest"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <IngestTab />
              </motion.div>
            )}
            {tab === "graph" && (
              <motion.div
                key="graph"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <GraphTab trialIds={graphTrialIds} />
              </motion.div>
            )}
            {tab === "watchlist" && (
              <motion.div
                key="watchlist"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <WatchlistTab />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
