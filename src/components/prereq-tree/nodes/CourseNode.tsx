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
  /** True for blocks in the coreq column — tinted with the secondary container. */
  coreq?: boolean;
  onNavigate?: (code: string) => void;
}

/** Whisper-Neumorphic surface tokens per `data-variant` (design.md §B). Cards
 *  carry a `border-border` border so they match the edge stroke (var(--border)). */
const VARIANT_CLASS: Record<CourseNodeVariant, string> = {
  root: "bg-primary-container text-on-primary-container",
  known: "bg-surface text-on-surface",
  unknown: "bg-error-container text-on-error-container",
  note: "bg-surface-container-low text-muted italic",
};

// Handles carry no visual weight; they exist on all four sides so a prereq
// edge can attach left/right and a coreq chain edge top/bottom without
// per-node role reasoning. left-target is rendered first so edges without an
// explicit targetHandle fall through to it.
const HIDDEN_HANDLE = {
  opacity: 0,
  width: 8,
  height: 8,
  border: "none",
  background: "transparent",
  pointerEvents: "none",
} as const;

export function CourseNode({ id, data }: NodeProps<CourseNodeData>) {
  const variant = data?.variant ?? "known";
  const isRoot = variant === "root";
  const surface =
    variant === "known" && data?.coreq ? "bg-secondary-container text-on-secondary-container" : VARIANT_CLASS[variant];
  return (
    <section
      data-node-id={id}
      data-variant={variant}
      className={`neu-raised border-border min-w-[120px] rounded-lg border ${surface} ${isRoot ? "px-4 py-3 text-center" : "px-3 py-2 text-left"}`}
    >
      <Handle type="target" id="right-target" position={Position.Right} style={HIDDEN_HANDLE} />
      <Handle type="target" id="top-target" position={Position.Top} style={HIDDEN_HANDLE} />
      <Handle type="source" id="left-source" position={Position.Left} style={HIDDEN_HANDLE} />
      <Handle type="source" id="bottom-source" position={Position.Bottom} style={HIDDEN_HANDLE} />
      {variant === "note" ? (
        <div className="text-xs leading-snug">{data?.text}</div>
      ) : (
        <>
          {isRoot && <div className="text-xs font-medium tracking-[0.05em] uppercase opacity-70">ROOT</div>}
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
