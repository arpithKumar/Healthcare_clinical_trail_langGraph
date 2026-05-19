"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ComponentType,
} from "react";
import { Network } from "lucide-react";
import { fetchSubgraph } from "@/lib/api";
import type { SubgraphData } from "@/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

// ── Minimal prop surface for the lazily loaded ForceGraph2D ──────────────────
// Defined here rather than imported from react-force-graph-2d so that missing
// or broken package declarations never cascade into a "Cannot find module" error.

type ForceGraph2DType = ComponentType<{
  graphData: { nodes: object[]; links: object[] };
  width: number;
  height: number;
  backgroundColor?: string;
  nodeRelSize?: number;
  nodeColor?: (n: object) => string;
  nodeLabel?: (n: object) => string;
  nodeCanvasObject?: (
    n: object,
    ctx: CanvasRenderingContext2D,
    scale: number,
  ) => void;
  nodeCanvasObjectMode?: () => string;
  linkColor?: (l: object) => string;
  linkLabel?: (l: object) => string;
  linkWidth?: number;
  linkDirectionalArrowLength?: number;
  linkDirectionalArrowRelPos?: number;
}>;

// ── Colour maps ───────────────────────────────────────────────────────────────

const NODE_COLOR: Record<string, string> = {
  Trial: "#6366f1",
  Condition: "#10b981",
  Medication: "#8b5cf6",
};

const LINK_COLOR: Record<string, string> = {
  TREATS: "#10b981",
  USES_MEDICATION: "#8b5cf6",
  EXCLUDES_CONDITION: "#f43f5e",
  EXCLUDES_MEDICATION: "#f43f5e",
};

const NODE_LEGEND = [
  { label: "Trial", color: "#6366f1" },
  { label: "Condition", color: "#10b981" },
  { label: "Medication", color: "#8b5cf6" },
];

const LINK_LEGEND = [
  { label: "Treats / Uses", color: "#10b981" },
  { label: "Excludes", color: "#f43f5e" },
];

// ── Custom canvas node renderer ───────────────────────────────────────────────

function drawNode(
  node: object,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
) {
  const n = node as { x: number; y: number; type: string; label: string };
  const r = n.type === "Trial" ? 9 : 6;
  const color = NODE_COLOR[n.type] ?? "#64748b";

  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;

  if (globalScale >= 0.6) {
    const fontSize = Math.max(10 / globalScale, 3.5);
    const maxLen = n.type === "Trial" ? 22 : 18;
    const text =
      n.label.length > maxLen ? n.label.slice(0, maxLen - 1) + "…" : n.label;
    ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(text, n.x, n.y + r + 2);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  trialIds: string[];
}

export function GraphTab({ trialIds }: Props) {
  // ForceGraph2D is loaded lazily inside useEffect so it never runs on the
  // server (avoids window/canvas errors without needing next/dynamic).
  const [ForceGraph, setForceGraph] = useState<ForceGraph2DType | null>(null);
  const [data, setData] = useState<SubgraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 900, h: 560 });

  // Load the library once on mount — client only
  useEffect(() => {
    import("react-force-graph-2d").then((mod) => {
      // Wrap in () => fn so React doesn't mistake the component for an updater
      setForceGraph(() => mod.default as ForceGraph2DType);
    });
  }, []);

  // Responsive canvas sizing via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDims({
        w: Math.floor(width),
        h: Math.floor(Math.max(480, width * 0.58)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fetch subgraph when trialIds change — all setState inside callbacks
  useEffect(() => {
    if (trialIds.length === 0) return;

    let cancelled = false;

    fetchSubgraph(trialIds)
      .then((d) => {
        if (!cancelled) {
          setError("");
          setData(d);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null);
          setError((e as Error).message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });

    return () => {
      cancelled = true;
    };
  }, [trialIds]);

  // Stable callbacks — avoids recreating ForceGraph on every render
  const nodeColor = useCallback(
    (n: object) => NODE_COLOR[(n as { type: string }).type] ?? "#64748b",
    [],
  );
  const nodeLabel = useCallback((n: object) => {
    const o = n as { type: string; label: string };
    return `${o.type}: ${o.label}`;
  }, []);
  const linkColor = useCallback(
    (l: object) => LINK_COLOR[(l as { type: string }).type] ?? "#475569",
    [],
  );
  const linkLabel = useCallback(
    (l: object) => (l as { type: string }).type,
    [],
  );
  const nodeMode = useCallback(() => "replace", []);

  // Derived: never show stale data when the prop goes back to empty
  const displayData = trialIds.length > 0 ? data : null;

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (trialIds.length === 0) {
    return (
      <EmptyState
        icon={<Network className="w-14 h-14" />}
        title="No graph to show yet"
        subtitle='Run a patient match, then click "Visualise Graph" to explore the knowledge graph'
      />
    );
  }

  // ── Graph view ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {NODE_LEGEND.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ background: color }}
            />
            <span className="text-xs text-slate-500">{label}</span>
          </div>
        ))}
        <div className="w-px h-4 bg-slate-700 hidden sm:block" />
        {LINK_LEGEND.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className="w-5 h-0.5 shrink-0 rounded"
              style={{ background: color }}
            />
            <span className="text-xs text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950"
        style={{ height: dims.h }}
      >
        {loading && <Skeleton className="w-full h-full rounded-none" />}

        {!loading && error && (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}

        {!loading && displayData && ForceGraph && (
          <ForceGraph
            graphData={displayData}
            width={dims.w}
            height={dims.h}
            backgroundColor="#020617"
            nodeRelSize={6}
            nodeColor={nodeColor}
            nodeLabel={nodeLabel}
            nodeCanvasObject={drawNode}
            nodeCanvasObjectMode={nodeMode}
            linkColor={linkColor}
            linkLabel={linkLabel}
            linkWidth={1.5}
            linkDirectionalArrowLength={5}
            linkDirectionalArrowRelPos={1}
          />
        )}
      </div>

      {displayData && !loading && (
        <p className="text-xs text-slate-500 text-center">
          Drag nodes to rearrange · Scroll to zoom ·{" "}
          <span className="text-slate-400">
            {displayData.nodes.length} nodes
          </span>
          {" · "}
          <span className="text-slate-400">
            {displayData.links.length} relationships
          </span>
        </p>
      )}
    </div>
  );
}
