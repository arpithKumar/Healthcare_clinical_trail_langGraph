"use client";

import {useState, useEffect} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {UserPlus, Users} from "lucide-react";
import {
    listPatientProfiles,
    createPatientProfile,
    updatePatientProfile,
    deletePatientProfile,
} from "@/lib/api";
import type {PatientProfile} from "@/types";
import {PatientCard} from "./PatientCard";
import {PatientForm} from "./PatientForm";
import {EmptyState} from "@/components/ui/EmptyState";
import {ErrorBanner} from "@/components/ui/ErrorBanner";
import {Skeleton} from "@/components/ui/Skeleton";

interface PatientTabProps {
    onMatchTrials: (profileText: string) => void;
}

export function PatientTab({onMatchTrials}: PatientTabProps) {
    const [profiles, setProfiles] = useState<PatientProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<PatientProfile | null>(null);

    useEffect(() => {
        listPatientProfiles()
            .then((data) => setProfiles(data))
            .catch((e: unknown) =>
                setError(e instanceof Error ? e.message : "Failed to load profiles"),
            )
            .finally(() => setLoading(false));
    }, []);

    const handleCreate = async (
        data: Omit<PatientProfile, "id" | "created_at" | "updated_at">,
    ) => {
        const created = await createPatientProfile(data);
        setProfiles((prev) => [created, ...prev]);
    };

    const handleUpdate = async (
        data: Omit<PatientProfile, "id" | "created_at" | "updated_at">,
    ) => {
        if (!editing) return;
        const updated = await updatePatientProfile(editing.id, data);
        setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setEditing(null);
    };

    const handleDelete = async (id: string) => {
        await deletePatientProfile(id);
        setProfiles((prev) => prev.filter((p) => p.id !== id));
    };

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const openEdit = (profile: PatientProfile) => {
        setEditing(profile);
        setFormOpen(true);
    };

    const closeForm = () => {
        setFormOpen(false);
        setEditing(null);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                        Patient Profiles
                    </h2>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
                        Save structured patient profiles and match them to trials in one click
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-violet-500/30 transition-all"
                >
                    <UserPlus className="w-4 h-4"/>
                    New Patient
                </button>
            </div>

            <AnimatePresence>
                {error && <ErrorBanner message={error}/>}
            </AnimatePresence>

            {/* Loading skeletons */}
            {loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({length: 3}).map((_, i) => (
                        <Skeleton key={i} className="h-48"/>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && profiles.length === 0 && !error && (
                <motion.div initial={{opacity: 0}} animate={{opacity: 1}}>
                    <EmptyState
                        icon={<Users className="w-14 h-14"/>}
                        title="No patient profiles yet"
                        subtitle="Create a structured patient profile to quickly match trials without re-typing each time"
                    />
                </motion.div>
            )}

            {/* Profiles grid */}
            {!loading && profiles.length > 0 && (
                <motion.div
                    initial={{opacity: 0}}
                    animate={{opacity: 1}}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                    {profiles.map((p, i) => (
                        <PatientCard
                            key={p.id}
                            profile={p}
                            index={i}
                            onEdit={() => openEdit(p)}
                            onDelete={() => handleDelete(p.id)}
                            onMatchTrials={onMatchTrials}
                        />
                    ))}
                </motion.div>
            )}

            {/* Form modal */}
            <AnimatePresence>
                {formOpen && (
                    <PatientForm
                        initial={editing}
                        onSave={editing ? handleUpdate : handleCreate}
                        onClose={closeForm}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
