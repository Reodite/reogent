"use client";

import { Handle, Position, type NodeProps } from "reactflow";

/** Course-shaped Prereq Tree node variants (REQ-9.4). `note` carries literal
 *  prose in `label` (no `code`); the course variants carry `code`. */
export type CourseNodeVariant = "root" | "known" | "unknown" | "note" | "coreq";

export interface CourseNodeData {
  id: string;
  code?: string;
  label?: string;
  variant?: CourseNodeVariant;
  onNavigate?: (code: string) => void;
}

/** Whisper-Neumorphic surface tokens per `data-variant` (design.md §B). */
const VARIANT_CLASS: Record<CourseNodeVariant, string> = {
  root: "bg-primary-container text-on-primary-container",
  known: "bg-surface text-on-surface",
  unknown: "bg-error-container text-on-error-container",
  note: "bg-surface-container-low text-muted",
  coreq: "bg-secondary-container text-on-secondary-container",
};

// Handles carry no visual weight; they exist so React Flow can attach edges on
// either side of the left-to-right tree without per-node role reasoning.
const HIDDEN_HANDLE = {
  opacity: 0,
  width: 8,
  height: 8,
  border: "none",
  background: "transparent",
  pointerEvents: "none",
} as const;

export function CourseNode({ data }: NodeProps<CourseNodeData>) {
  const variant = data?.variant ?? "known";
  return (
    <section
      data-node-id={data?.id}
      data-variant={variant}
      className={`neu-raised min-w-[120px] rounded-lg px-3 py-2 text-center ${VARIANT_CLASS[variant]}`}
    >
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} />
      {variant === "root" && <div className="text-[0.625rem] tracking-wide uppercase opacity-70">ROOT</div>}
      {data?.onNavigate && data?.code ? (
        <button
          type="button"
          data-nav="course"
          className="font-mono text-sm font-medium hover:underline focus-visible:underline"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => data?.onNavigate?.(data.code as string)}
        >
          {data?.code ?? data?.label}
        </button>
      ) : (
        <div className="font-mono text-sm font-medium">{data?.code ?? data?.label}</div>
      )}
      {variant === "unknown" && (
        <div className="text-on-error-container text-[0.625rem]" title="Not in UBC Vancouver catalog">
          not in catalog
        </div>
      )}
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} />
    </section>
  );
}

export { VARIANT_CLASS };
