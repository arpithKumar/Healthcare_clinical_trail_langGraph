"use client";

import {useState, useRef, KeyboardEvent} from "react";
import {motion, AnimatePresence} from "framer-motion";
import {X, Plus, User} from "lucide-react";
import type {PatientProfile} from "@/types";

interface PatientFormProps {
    initial?: PatientProfile | null;
    onSave: (data: Omit<PatientProfile, "id" | "created_at" | "updated_at">) => Promise<void>;
    onClose: () => void;
}

function TagInput({
    label,
    values,
    onChange,
    placeholder,
    colorClass,
}: {
    label: string;
    values: string[];
    onChange: (next: string[]) => void;
    placeholder: string;
    colorClass: string;
}) {
    const [input, setInput] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const add = () => {
        const trimmed = input.trim().replace(/,+$/, "");
        if (trimmed && !values.includes(trimmed.toLowerCase())) {
            onChange([...values, trimmed.toLowerCase()]);
        }
        setInput("");
    };

    const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
        } else if (e.key === "Backspace" && input === "" && values.length > 0) {
            onChange(values.slice(0, -1));
        }
    };

    return (
        <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                {label}
            </label>
            <div
                className="min-h-10.5 flex flex-wrap gap-1.5 p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl cursor-text"
                onClick={() => inputRef.current?.focus()}
            >
                {values.map((v) => (
                    <span
                        key={v}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-medium ${colorClass}`}
                    >
                        {v}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange(values.filter((x) => x !== v));
                            }}
                            className="hover:opacity-70"
                        >
                            <X className="w-3 h-3"/>
                        </button>
                    </span>
                ))}
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    onBlur={add}
                    placeholder={values.length === 0 ? placeholder : ""}
                    className="flex-1 min-w-30 bg-transparent text-sm text-slate-800 dark:text-slate-200 outline-none placeholder:text-slate-400"
                />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Press Enter or comma to add</p>
        </div>
    );
}

export function PatientForm({initial, onSave, onClose}: PatientFormProps) {
    const [name, setName] = useState(initial?.name ?? "");
    const [age, setAge] = useState<string>(initial?.age != null ? String(initial.age) : "");
    const [gender, setGender] = useState<string>(initial?.gender ?? "");
    const [conditions, setConditions] = useState<string[]>(initial?.conditions ?? []);
    const [medications, setMedications] = useState<string[]>(initial?.medications ?? []);
    const [notes, setNotes] = useState(initial?.notes ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const isEdit = Boolean(initial);

    const handleSubmit = async () => {
        if (!name.trim()) {
            setError("Name is required.");
            return;
        }
        setSaving(true);
        setError("");
        try {
            await onSave({
                name: name.trim(),
                age: age !== "" ? parseInt(age, 10) : null,
                gender: gender || null,
                conditions,
                medications,
                notes: notes.trim() || null,
            });
            onClose();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{opacity: 0, y: 40}}
                animate={{opacity: 1, y: 0}}
                exit={{opacity: 0, y: 40}}
                transition={{type: "spring", stiffness: 320, damping: 32}}
                className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                            <User className="w-4 h-4 text-violet-600 dark:text-violet-400"/>
                        </div>
                        <h2 className="font-bold text-slate-800 dark:text-slate-100">
                            {isEdit ? "Edit Patient" : "New Patient Profile"}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                    >
                        <X className="w-4 h-4"/>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <AnimatePresence>
                        {error && (
                            <motion.p
                                initial={{opacity: 0, height: 0}}
                                animate={{opacity: 1, height: "auto"}}
                                exit={{opacity: 0, height: 0}}
                                className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2"
                            >
                                {error}
                            </motion.p>
                        )}
                    </AnimatePresence>

                    {/* Name */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                            Display Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. John D."
                            className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-400 dark:focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                        />
                    </div>

                    {/* Age + Gender */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                Age
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={150}
                                value={age}
                                onChange={(e) => setAge(e.target.value)}
                                placeholder="e.g. 55"
                                className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-400 dark:focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                Gender
                            </label>
                            <select
                                value={gender}
                                onChange={(e) => setGender(e.target.value)}
                                className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-400 dark:focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                            >
                                <option value="">Not specified</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                    </div>

                    {/* Conditions */}
                    <TagInput
                        label="Conditions"
                        values={conditions}
                        onChange={setConditions}
                        placeholder="e.g. type 2 diabetes"
                        colorClass="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                    />

                    {/* Medications */}
                    <TagInput
                        label="Current Medications"
                        values={medications}
                        onChange={setMedications}
                        placeholder="e.g. metformin"
                        colorClass="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    />

                    {/* Notes */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                            Clinical Notes
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Any additional context for this patient…"
                            rows={3}
                            className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-400 dark:focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all shadow-sm shadow-violet-500/30"
                    >
                        {saving ? (
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                        ) : (
                            <Plus className="w-4 h-4"/>
                        )}
                        {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Profile"}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
