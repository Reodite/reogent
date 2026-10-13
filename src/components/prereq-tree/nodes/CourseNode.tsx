"use client";

import { Handle, Position, type NodeProps } from "reactflow";

/** Course-shaped Prereq Tree node variants. `note` carries literal prose in
 *  `text` (no `code`); the course variants carry `code` + `title`. */
export type CourseNodeVariant = "root" | "known" | "unknown" | "note";

export interface CourseNodeData {
  variant: CourseNodeVariant;
  code?: string;
  title?: string;
  text?: string;
  /** True for blocks in the corequisite column. */
  coreq?: boolean;
  onNavigate?: (code: string) => void;
}

/** Maps course state to semantic colors; relationship categories retain neutral material. */
const VARIANT_CLASS: Record<CourseNodeVariant, string> = {
  root: "bg-primary-container text-on-primary-container",
  known: "bg-surface text-on-surface",
  unknown: "bg-error-container text-on-error-container",
  note: "bg-surface-container-low text-muted italic",
};

const HIDDEN_HANDLE = {
  opacity: 0,
  width: 8,
  height: 8,
  border: "none",
  background: "transparent",
  pointerEvents: "none",
} as const;

/** Shares the raised graph-node material without changing its spatial wrapper. */
export function nodeSurfaceClasses(variant: CourseNodeVariant = "known"): string {
  return `neu-raised border-border rounded-lg border ${VARIANT_CLASS[variant]}`;
}

/** Preserves prerequisite side attachments and corequisite vertical attachments.
 *  Places right-target first for edges without an explicit targetHandle. */
export function NodeHandles() {
  return (
    <>
      <Handle type="target" id="right-target" position={Position.Right} style={HIDDEN_HANDLE} />
      <Handle type="target" id="top-target" position={Position.Top} style={HIDDEN_HANDLE} />
      <Handle type="source" id="left-source" position={Position.Left} style={HIDDEN_HANDLE} />
      <Handle type="source" id="bottom-source" position={Position.Bottom} style={HIDDEN_HANDLE} />
    </>
  );
}

export function CourseNode({ id, data }: NodeProps<CourseNodeData>) {
  const variant = data?.variant ?? "known";
  const isRoot = variant === "root";
  return (
    <section
      data-node-id={id}
      data-variant={variant}
      className={`${nodeSurfaceClasses(variant)} min-w-[120px] ${isRoot ? "px-4 py-3 text-center" : "px-3 py-2 text-left"}`}
    >
      <NodeHandles />
      {variant === "note" ? (
        <div className="text-xs leading-snug">{data?.text}</div>
      ) : (
        <>
          {isRoot && <div className="text-xs font-medium tracking-[0.05em] uppercase">ROOT</div>}
          {data?.onNavigate && data?.code ? (
            <button
              type="button"
              data-nav="course"
              className={`inline-flex min-h-14 min-w-14 items-center justify-center rounded-md font-mono font-medium hover:underline focus-visible:underline ${isRoot ? "text-xl" : "text-sm"}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                data?.onNavigate?.(data.code as string);
              }}
            >
              {data.code}
            </button>
          ) : (
            <div className={`font-mono font-medium ${isRoot ? "text-xl" : "text-sm"}`}>{data?.code}</div>
          )}
          {data?.title && (
            <div
              className={`border-border border-t leading-snug ${isRoot ? "mt-2 pt-2 text-base" : "mt-1.5 pt-1.5 text-xs"}`}
            >
              {data.title}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export { VARIANT_CLASS };
