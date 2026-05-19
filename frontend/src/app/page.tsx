"use client";

import {useEffect, useState} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {Navbar} from "@/components/layout/Navbar";
import type {Tab} from "@/components/layout/Navbar";
import {MatchTab} from "@/components/match/MatchTab";
import {IngestTab} from "@/components/ingest/IngestTab";
import {GraphTab} from "@/components/graph/GraphTab";
import {WatchlistTab} from "@/components/watchlist/WatchlistTab";
import {SearchTab} from "@/components/search/SearchTab";
import {DashboardTab} from "@/components/dashboard/DashboardTab";
import {PatientTab} from "@/components/patients/PatientTab";
import {SettingsPanel, loadLlmSettings} from "@/components/settings/SettingsPanel";
import type {LlmSettings} from "@/components/settings/SettingsPanel";

const pageVariants = {
    initial: {opacity: 0, y: 8},
    animate: {opacity: 1, y: 0},
    exit: {opacity: 0, y: -8},
};

export default function Home() {
    const [tab, setTab] = useState<Tab>("match");
    const [graphTrialIds, setGraphTrialIds] = useState<string[]>([]);
    const [conditionFilter, setConditionFilter] = useState("");
    const [matchInitialProfile, setMatchInitialProfile] = useState("");
    const [matchKey, setMatchKey] = useState(0);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [llmSettings, setLlmSettings] = useState<LlmSettings>({provider: "ollama", model: "llama3"});

    // Load persisted LLM settings from localStorage after first render
    useEffect(() => {
        setLlmSettings(loadLlmSettings());
    }, []);

    const handleVisualize = (ids: string[]) => {
        setGraphTrialIds(ids);
        setTab("graph");
    };

    const handleFindTrials = (condition: string) => {
        setConditionFilter(condition);
        setTab("trials");
    };

    const handleMatchFromPatient = (profileText: string) => {
        setMatchInitialProfile(profileText);
        setMatchKey((k) => k + 1);
        setTab("match");
    };

    return (
        <div
            className="min-h-screen bg-linear-to-br from-slate-50 via-white to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20 transition-colors duration-300">
            <div className="bg-dot-grid min-h-screen">
                <Navbar
                    tab={tab}
                    onTabChange={setTab}
                    onSettingsClick={() => setSettingsOpen(true)}
                    llmLabel={`${llmSettings.provider} / ${llmSettings.model}`}
                />
                <SettingsPanel
                    open={settingsOpen}
                    onClose={() => setSettingsOpen(false)}
                    settings={llmSettings}
                    onSave={setLlmSettings}
                />

                <main className="max-w-7xl mx-auto px-6 py-10">
                    <AnimatePresence mode="wait">
                        {tab === "match" && (
                            <motion.div
                                key="match"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{duration: 0.2}}
                            >
                                <MatchTab
                                    key={matchKey}
                                    onVisualize={handleVisualize}
                                    initialProfile={matchInitialProfile}
                                    llmProvider={llmSettings.provider}
                                    llmModel={llmSettings.model}
                                />
                            </motion.div>
                        )}
                        {tab === "trials" && (
                            <motion.div
                                key="trials"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{duration: 0.2}}
                            >
                                <SearchTab initialCondition={conditionFilter}/>
                            </motion.div>
                        )}
                        {tab === "dashboard" && (
                            <motion.div
                                key="dashboard"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{duration: 0.2}}
                            >
                                <DashboardTab onFindTrials={handleFindTrials}/>
                            </motion.div>
                        )}
                        {tab === "ingest" && (
                            <motion.div
                                key="ingest"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{duration: 0.2}}
                            >
                                <IngestTab/>
                            </motion.div>
                        )}
                        {tab === "graph" && (
                            <motion.div
                                key="graph"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{duration: 0.2}}
                            >
                                <GraphTab trialIds={graphTrialIds}/>
                            </motion.div>
                        )}
                        {tab === "watchlist" && (
                            <motion.div
                                key="watchlist"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{duration: 0.2}}
                            >
                                <WatchlistTab/>
                            </motion.div>
                        )}
                        {tab === "patients" && (
                            <motion.div
                                key="patients"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{duration: 0.2}}
                            >
                                <PatientTab onMatchTrials={handleMatchFromPatient}/>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
}
