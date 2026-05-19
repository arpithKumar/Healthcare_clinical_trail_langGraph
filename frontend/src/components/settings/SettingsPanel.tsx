"use client";

import {useEffect, useRef, useState} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {X, Cpu, Info} from "lucide-react";

// ── Provider / model catalogue ────────────────────────────────────────────────

export interface LlmSettings {
    provider: string;
    model: string;
}

const DEFAULT_SETTINGS: LlmSettings = {provider: "ollama", model: "llama3"};

const PROVIDERS = [
    {
        id: "ollama",
        label: "Ollama",
        description: "Runs entirely on your machine — no API key needed.",
        models: ["llama3", "llama3.1", "llama3.2", "mistral", "gemma2"],
    },
    {
        id: "openai",
        label: "OpenAI",
        description: "Requires OPENAI_API_KEY set on the backend server.",
        models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    },
    {
        id: "anthropic",
        label: "Anthropic",
        description: "Requires ANTHROPIC_API_KEY set on the backend server.",
        models: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"],
    },
];

const STORAGE_KEY = "ct_llm_settings";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function loadLlmSettings(): LlmSettings {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as LlmSettings;
    } catch {
        // ignore
    }
    return DEFAULT_SETTINGS;
}

function saveLlmSettings(s: LlmSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
        // ignore
    }
}

// ── Chip ──────────────────────────────────────────────────────────────────────

function Chip({
    label,
    active,
    onClick,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all duration-150 ${
                active
                    ? "bg-indigo-500/15 border-indigo-500/50 text-indigo-600 dark:text-indigo-400"
                    : "bg-transparent border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
        >
            {label}
        </button>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
    open: boolean;
    onClose: () => void;
    settings: LlmSettings;
    onSave: (s: LlmSettings) => void;
}

export function SettingsPanel({open, onClose, settings, onSave}: Props) {
    const [local, setLocal] = useState<LlmSettings>(settings);
    const panelRef = useRef<HTMLDivElement>(null);

    // Sync when parent settings change (e.g. on first mount from localStorage)
    useEffect(() => {
        queueMicrotask(() => setLocal(settings));
    }, [settings]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open, onClose]);

    const activeProvider = PROVIDERS.find((p) => p.id === local.provider) ?? PROVIDERS[0];

    function handleProviderChange(id: string) {
        const prov = PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
        setLocal({provider: prov.id, model: prov.models[0]});
    }

    function handleSave() {
        saveLlmSettings(local);
        onSave(local);
        onClose();
    }

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
                        initial={{opacity: 0}}
                        animate={{opacity: 1}}
                        exit={{opacity: 0}}
                        transition={{duration: 0.15}}
                    />

                    {/* Panel */}
                    <motion.div
                        ref={panelRef}
                        className="fixed right-4 top-20 z-50 w-76 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl shadow-slate-900/20 overflow-hidden"
                        initial={{opacity: 0, y: -10, scale: 0.96}}
                        animate={{opacity: 1, y: 0, scale: 1}}
                        exit={{opacity: 0, y: -10, scale: 0.96}}
                        transition={{duration: 0.18, ease: "easeOut"}}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950">
                                    <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400"/>
                                </div>
                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                    LLM Settings
                                </span>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <X className="w-4 h-4"/>
                            </button>
                        </div>

                        <div className="p-5 space-y-5">
                            {/* Provider chips */}
                            <div className="space-y-2">
                                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                    Provider
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {PROVIDERS.map((p) => (
                                        <Chip
                                            key={p.id}
                                            label={p.label}
                                            active={local.provider === p.id}
                                            onClick={() => handleProviderChange(p.id)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Model chips */}
                            <div className="space-y-2">
                                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                    Model
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {activeProvider.models.map((m) => (
                                        <Chip
                                            key={m}
                                            label={m}
                                            active={local.model === m}
                                            onClick={() => setLocal((s) => ({...s, model: m}))}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* API-key notice for cloud providers */}
                            {local.provider !== "ollama" && (
                                <div className="flex gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                                    <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"/>
                                    <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                                        {activeProvider.description}
                                    </p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white transition-colors shadow-sm"
                                >
                                    Apply
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
