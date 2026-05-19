"use client";

import {useState} from "react";
import {motion} from "framer-motion";
import {
    User,
    Edit2,
    Trash2,
    Search,
    CalendarDays,
    StickyNote,
} from "lucide-react";
import type {PatientProfile} from "@/types";

interface PatientCardProps {
    profile: PatientProfile;
    index: number;
    onEdit: () => void;
    onDelete: () => void;
    onMatchTrials: (profileText: string) => void;
}

function assembleProfile(p: PatientProfile): string {
    const lines: string[] = [];
    const demo = [p.age != null ? `${p.age}yo` : "", p.gender ?? ""].filter(Boolean).join(" ");
    if (demo && p.conditions.length > 0) {
        lines.push(`${demo} with ${p.conditions.join(", ")}.`);
    } else if (demo) {
        lines.push(`${demo}.`);
    } else if (p.conditions.length > 0) {
        lines.push(`Patient with ${p.conditions.join(", ")}.`);
    }
    if (p.medications.length > 0) {
        lines.push(`Currently taking ${p.medications.join(", ")}.`);
    }
    if (p.notes) {
        lines.push(p.notes.endsWith(".") ? p.notes : `${p.notes}.`);
    }
    return lines.join(" ");
}

export function PatientCard({profile, index, onEdit, onDelete, onMatchTrials}: PatientCardProps) {
    const [confirmDelete, setConfirmDelete] = useState(false);

    const created = new Date(profile.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });

    return (
        <motion.div
            initial={{opacity: 0, y: 12}}
            animate={{opacity: 1, y: 0}}
            transition={{delay: index * 0.05}}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 space-y-4"
        >
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        <User className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400"/>
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate">{profile.name}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400">
                            <CalendarDays className="w-3 h-3"/>
                            <span>{created}</span>
                            {profile.age != null && (
                                <>
                                    <span>·</span>
                                    <span>{profile.age}yo</span>
                                </>
                            )}
                            {profile.gender && (
                                <>
                                    <span>·</span>
                                    <span className="capitalize">{profile.gender}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={onEdit}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                        title="Edit profile"
                    >
                        <Edit2 className="w-3.5 h-3.5"/>
                    </button>
                    {confirmDelete ? (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={onDelete}
                                className="px-2 py-1 text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-lg transition-colors"
                            >
                                Confirm
                            </button>
                            <button
                                onClick={() => setConfirmDelete(false)}
                                className="px-2 py-1 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmDelete(true)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                            title="Delete profile"
                        >
                            <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                    )}
                </div>
            </div>

            {/* Conditions */}
            {profile.conditions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {profile.conditions.map((c) => (
                        <span
                            key={c}
                            className="px-2 py-0.5 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800"
                        >
                            {c}
                        </span>
                    ))}
                </div>
            )}

            {/* Medications */}
            {profile.medications.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {profile.medications.map((m) => (
                        <span
                            key={m}
                            className="px-2 py-0.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800"
                        >
                            💊 {m}
                        </span>
                    ))}
                </div>
            )}

            {/* Notes */}
            {profile.notes && (
                <div className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <StickyNote className="w-3.5 h-3.5 shrink-0 mt-0.5"/>
                    <p className="line-clamp-2">{profile.notes}</p>
                </div>
            )}

            {/* Match Trials button */}
            <button
                onClick={() => onMatchTrials(assembleProfile(profile))}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-semibold rounded-xl border border-indigo-100 dark:border-indigo-800 transition-all duration-150"
            >
                <Search className="w-3.5 h-3.5"/>
                Match Trials
            </button>
        </motion.div>
    );
}
