"use client";

import {Dna, Search, Upload, Network, BookMarked, FlaskConical, BarChart2, UserCircle, Settings2} from "lucide-react";
import {ThemeToggle} from "@/components/ThemeToggle";
import React from "react";

export type Tab = "match" | "ingest" | "graph" | "watchlist" | "trials" | "dashboard" | "patients";

interface NavbarProps {
    tab: Tab;
    onTabChange: (tab: Tab) => void;
    onSettingsClick?: () => void;
    llmLabel?: string;
}

export function Navbar({tab, onTabChange, onSettingsClick, llmLabel}: NavbarProps) {
    return (
        <nav
            className="sticky top-0 z-30 w-full border-b border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                {/* Brand */}
                <div className="flex items-center gap-3">
                    <div
                        className="p-2 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
                        <Dna className="w-5 h-5 text-white"/>
                    </div>
                    <div>
                        <h1 className="font-bold text-base leading-none tracking-tight text-slate-900 dark:text-white">
                            Clinical GraphRAG
                        </h1>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                            {llmLabel ? `${llmLabel} · Neo4j` : "Powered by Llama 3 · Neo4j"}
                        </p>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3">
                    <div
                        className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                        <TabButton
                            active={tab === "match"}
                            onClick={() => onTabChange("match")}
                            icon={<Search className="w-3 h-3"/>}
                            label="Match"
                        />
                        <TabButton
                            active={tab === "trials"}
                            onClick={() => onTabChange("trials")}
                            icon={<FlaskConical className="w-3 h-3"/>}
                            label="Trials"
                        />
                        <TabButton
                            active={tab === "dashboard"}
                            onClick={() => onTabChange("dashboard")}
                            icon={<BarChart2 className="w-3 h-3"/>}
                            label="Insights"
                        />
                        <TabButton
                            active={tab === "ingest"}
                            onClick={() => onTabChange("ingest")}
                            icon={<Upload className="w-3 h-3"/>}
                            label="Ingest"
                        />
                        <TabButton
                            active={tab === "graph"}
                            onClick={() => onTabChange("graph")}
                            icon={<Network className="w-3 h-3"/>}
                            label="Graph"
                        />
                        <TabButton
                            active={tab === "watchlist"}
                            onClick={() => onTabChange("watchlist")}
                            icon={<BookMarked className="w-3 h-3"/>}
                            label="Watchlist"
                        />
                        <TabButton
                            active={tab === "patients"}
                            onClick={() => onTabChange("patients")}
                            icon={<UserCircle className="w-3 h-3"/>}
                            label="Patients"
                        />
                    </div>
                    {onSettingsClick && (
                        <button
                            onClick={onSettingsClick}
                            title={`LLM: ${llmLabel ?? "ollama / llama3"}`}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-600 bg-white dark:bg-slate-900 transition-all duration-200"
                        >
                            <Settings2 className="w-3.5 h-3.5"/>
                            <span className="hidden sm:inline max-w-[80px] truncate">{llmLabel ?? "llama3"}</span>
                        </button>
                    )}
                    <ThemeToggle/>
                </div>
            </div>
        </nav>
    );
}

function TabButton({
                       active,
                       onClick,
                       icon,
                       label,
                   }: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                active
                    ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
        >
            {icon}
            {label}
        </button>
    );
}
