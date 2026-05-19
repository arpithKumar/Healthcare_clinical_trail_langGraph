"use client";

import {useState} from "react";
import {FileJson, Loader2, Check} from "lucide-react";
import {motion} from "framer-motion";
import type {MatchResponse, ScoredTrial} from "@/types";

interface Props {
    result: MatchResponse;
    displayTrials: ScoredTrial[];
}

function uuidv4(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export function ExportFhirButton({result, displayTrials}: Props) {
    const [exporting, setExporting] = useState(false);
    const [exported, setExported] = useState(false);

    const handleExport = () => {
        setExporting(true);
        try {
            const patientId = uuidv4();
            const now = new Date().toISOString();
            const date = now.slice(0, 10);

            const entries: object[] = [];

            // ── Patient resource ──────────────────────────────────────────────
            entries.push({
                fullUrl: `urn:uuid:${patientId}`,
                resource: {
                    resourceType: "Patient",
                    id: patientId,
                    text: {
                        status: "generated",
                        div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>${result.patient_profile.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p></div>`,
                    },
                },
            });

            // ── Agent verdict Observation ─────────────────────────────────────
            if (result.agent_verdict) {
                const verdictId = uuidv4();
                entries.push({
                    fullUrl: `urn:uuid:${verdictId}`,
                    resource: {
                        resourceType: "Observation",
                        id: verdictId,
                        status: "final",
                        code: {
                            coding: [{
                                system: "http://loinc.org",
                                code: "75326-9",
                                display: "Problem",
                            }],
                            text: "Clinical Trial Matching Assessment",
                        },
                        subject: {reference: `urn:uuid:${patientId}`},
                        valueString: result.agent_verdict,
                        effectiveDateTime: now,
                    },
                });
            }

            // ── ResearchStudy + RiskAssessment per trial ──────────────────────
            for (const trial of displayTrials) {
                const studyId = uuidv4();
                const riskId = uuidv4();

                entries.push({
                    fullUrl: `urn:uuid:${studyId}`,
                    resource: {
                        resourceType: "ResearchStudy",
                        id: studyId,
                        identifier: trial.trial_id.startsWith("NCT")
                            ? [{system: "https://clinicaltrials.gov", value: trial.trial_id}]
                            : [{value: trial.trial_id}],
                        title: trial.trial_title,
                        status: "active",
                    },
                });

                const riskResource: Record<string, unknown> = {
                    resourceType: "RiskAssessment",
                    id: riskId,
                    status: "final",
                    subject: {reference: `urn:uuid:${patientId}`},
                    basis: [{reference: `urn:uuid:${studyId}`}],
                    prediction: [{
                        outcome: {text: "Clinical trial eligibility match"},
                        probabilityDecimal: parseFloat((trial.score / 100).toFixed(2)),
                        rationale: trial.reasons.join("; ") || "Matched by graph query",
                    }],
                    occurrenceDateTime: now,
                };

                if (trial.concerns.length > 0) {
                    riskResource.note = [{text: "Concerns: " + trial.concerns.join("; ")}];
                }

                if (trial.interaction_warnings && trial.interaction_warnings.length > 0) {
                    riskResource.extension = [{
                        url: "https://example.org/fhir/StructureDefinition/drug-interaction-warning",
                        valueString: trial.interaction_warnings.join("; "),
                    }];
                }

                entries.push({
                    fullUrl: `urn:uuid:${riskId}`,
                    resource: riskResource,
                });
            }

            // ── Assemble Bundle ───────────────────────────────────────────────
            const bundle = {
                resourceType: "Bundle",
                id: `trial-match-${date}`,
                type: "collection",
                timestamp: now,
                entry: entries,
            };

            const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                type: "application/fhir+json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `trial-match-FHIR-${date}.json`;
            a.click();
            URL.revokeObjectURL(url);

            setExported(true);
            setTimeout(() => setExported(false), 3000);
        } finally {
            setExporting(false);
        }
    };

    return (
        <motion.button
            onClick={handleExport}
            disabled={exporting}
            initial={{opacity: 0, y: 8}}
            animate={{opacity: 1, y: 0}}
            transition={{delay: 0.4}}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 ${
                exported
                    ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 cursor-default"
                    : "border border-teal-500/30 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 hover:border-teal-500/60"
            }`}
        >
            {exported ? (
                <Check className="w-4 h-4"/>
            ) : exporting ? (
                <Loader2 className="w-4 h-4 animate-spin"/>
            ) : (
                <FileJson className="w-4 h-4"/>
            )}
            {exported ? "Exported!" : exporting ? "Exporting…" : "Export FHIR"}
        </motion.button>
    );
}
