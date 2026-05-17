"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FileDown, Loader2 } from "lucide-react";
import type { MatchResponse, ScoredTrial } from "@/types";

interface Props {
  result: MatchResponse;
  displayTrials: ScoredTrial[];
}

export function DownloadReportButton({ result, displayTrials }: Props) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      buildReport(doc, result, displayTrials);
      const date = new Date().toISOString().slice(0, 10);
      doc.save(`trial-match-${date}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <motion.button
      onClick={handleDownload}
      disabled={generating}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="flex items-center justify-center gap-2 py-3 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400 text-sm font-medium hover:bg-sky-500/20 hover:border-sky-500/60 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {generating ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileDown className="w-4 h-4" />
      )}
      {generating ? "Generating…" : "Download Report"}
    </motion.button>
  );
}

// ── PDF builder ───────────────────────────────────────────────────────────────

type JsPDF = InstanceType<typeof import("jspdf").default>;

function buildReport(
  doc: JsPDF,
  result: MatchResponse,
  displayTrials: ScoredTrial[],
) {
  const pageW = doc.internal.pageSize.getWidth(); // 210
  const pageH = doc.internal.pageSize.getHeight(); // 297
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = 0;

  // ── Helpers ──────────────────────────────────────────────────────────────

  const newPage = () => {
    doc.addPage();
    y = margin + 4;
  };

  const checkBreak = (needed: number) => {
    if (y + needed > pageH - 14) newPage();
  };

  const setColor = (r: number, g: number, b: number) =>
    doc.setTextColor(r, g, b);

  const sectionHeader = (label: string) => {
    checkBreak(12);
    doc.setFillColor(238, 242, 255);
    doc.rect(margin, y, contentW, 7, "F");
    doc.setFillColor(99, 102, 241);
    doc.rect(margin, y, 3, 7, "F");
    setColor(67, 56, 202);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(label.toUpperCase(), margin + 6, y + 5);
    y += 11;
  };

  const paragraph = (text: string, indent = 0, fontSize = 9.5) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    setColor(51, 65, 85);
    const lines = doc.splitTextToSize(text, contentW - indent);
    checkBreak(lines.length * 5.2 + 2);
    doc.text(lines, margin + indent, y);
    y += lines.length * 5.2 + 2;
  };

  const bulletLine = (
    marker: string,
    text: string,
    mr: number,
    mg: number,
    mb: number,
  ) => {
    checkBreak(6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setColor(mr, mg, mb);
    doc.text(marker, margin + 4, y);
    doc.setFont("helvetica", "normal");
    setColor(71, 85, 105);
    const clipped = doc.splitTextToSize(text, contentW - 14)[0] ?? text;
    doc.text(clipped, margin + 10, y);
    y += 5.5;
  };

  // ── Header block ─────────────────────────────────────────────────────────
  doc.setFillColor(55, 48, 163);
  doc.rect(0, 0, pageW, 38, "F");

  setColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Clinical Trial Match Report", margin, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 22);

  // Patient summary line in header
  const profileSnippet =
    result.patient_profile.length > 90
      ? result.patient_profile.slice(0, 90) + "…"
      : result.patient_profile;
  doc.text(`Patient: ${profileSnippet}`, margin, 30);

  // Trial count badge (top-right)
  const count = displayTrials.length;
  doc.setFillColor(99, 102, 241);
  doc.rect(pageW - margin - 32, 10, 32, 14, "F");
  setColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(String(count), pageW - margin - 16, 21, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("trials matched", pageW - margin - 16, 27, { align: "center" });

  y = 46;

  // ── Patient Profile ───────────────────────────────────────────────────────
  sectionHeader("Patient Profile");
  paragraph(result.patient_profile);
  y += 3;

  // ── Clinical Assessment ───────────────────────────────────────────────────
  if (result.agent_verdict) {
    sectionHeader("Clinical Assessment");
    paragraph(result.agent_verdict);
    y += 3;
  }

  // ── Matched Trials ────────────────────────────────────────────────────────
  sectionHeader(`Matched Trials  (${count} found)`);

  displayTrials.forEach((trial, idx) => {
    checkBreak(28);

    const score = trial.score ?? 0;

    // Score colour
    const [sr, sg, sb]: [number, number, number] =
      score >= 70
        ? [16, 185, 129]
        : score >= 40
          ? [245, 158, 11]
          : [239, 68, 68];

    // Trial title row
    const title = `${idx + 1}.  ${trial.trial_title || trial.trial_id}`;
    const titleClipped = title.length > 68 ? title.slice(0, 68) + "…" : title;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setColor(15, 23, 42);
    doc.text(titleClipped, margin + 2, y);

    // Score badge
    doc.setFillColor(sr, sg, sb);
    doc.rect(pageW - margin - 14, y - 5.5, 14, 7, "F");
    setColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(`${score}`, pageW - margin - 7, y, { align: "center" });
    y += 4;

    // Score bar track + fill
    doc.setFillColor(226, 232, 240);
    doc.rect(margin + 2, y, contentW - 18, 2, "F");
    doc.setFillColor(sr, sg, sb);
    doc.rect(margin + 2, y, (contentW - 18) * (score / 100), 2, "F");
    y += 5;

    // Trial ID + ID line
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(148, 163, 184);
    doc.text(trial.trial_id, margin + 2, y);
    y += 5;

    // Reasons
    (trial.reasons ?? [])
      .slice(0, 4)
      .forEach((r) => bulletLine("+", r, 16, 185, 129));

    // Concerns
    (trial.concerns ?? [])
      .slice(0, 4)
      .forEach((c) => bulletLine("!", c, 245, 158, 11));

    // Per-trial drug interaction warnings
    const warns = trial.interaction_warnings ?? [];
    if (warns.length > 0) {
      checkBreak(8 + warns.length * 5);
      doc.setFillColor(255, 251, 235);
      doc.setDrawColor(252, 211, 77);
      doc.rect(margin + 2, y, contentW - 4, 6 + warns.length * 5, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      setColor(180, 83, 9);
      doc.text("Drug Interaction Warning", margin + 5, y + 4.5);
      y += 7;
      warns.forEach((w) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        setColor(120, 53, 15);
        const clipped = doc.splitTextToSize(`• ${w}`, contentW - 10)[0] ?? w;
        doc.text(clipped, margin + 5, y);
        y += 5;
      });
      y += 2;
    }

    // Row divider
    y += 3;
    if (idx < displayTrials.length - 1) {
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y - 1, pageW - margin, y - 1);
      y += 3;
    }
  });

  // ── Global drug interaction summary ──────────────────────────────────────
  const globalWarns = result.interaction_warnings ?? [];
  if (globalWarns.length > 0) {
    y += 2;
    sectionHeader("Drug Interaction Summary");
    globalWarns.forEach((w) => paragraph(`• ${w}`, 2, 9));
    y += 3;
  }

  // ── Cypher trace (collapsed, small) ──────────────────────────────────────
  if (result.executed_cypher) {
    checkBreak(16);
    sectionHeader("Executed Cypher Query");
    doc.setFont("courier", "normal");
    doc.setFontSize(7.5);
    setColor(100, 116, 139);
    const lines = doc.splitTextToSize(result.executed_cypher, contentW - 4);
    const shown = lines.slice(0, 8); // cap at 8 lines to avoid huge pages
    checkBreak(shown.length * 4.5 + 3);
    doc.text(shown, margin + 2, y);
    if (lines.length > 8) {
      y += shown.length * 4.5 + 1;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      setColor(148, 163, 184);
      doc.text(`… (${lines.length - 8} more lines omitted)`, margin + 2, y);
    }
    y += shown.length * 4.5 + 3;
  }

  // ── Footer on every page ─────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(148, 163, 184);
    doc.text(
      "Healthcare Clinical Trial Matching System — Confidential",
      margin,
      pageH - 7,
    );
    doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 7, {
      align: "right",
    });
  }
}
