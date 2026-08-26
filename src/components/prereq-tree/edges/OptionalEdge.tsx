"use client";

import { Icon } from "@/src/components/icons";
import { EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow";

export interface OptionalEdgeData {
  /** Soft branch key (`${ownerCode}::${path}.soft`) the toggle flips. */
  softKey: string;
  /** True when the user has opted out of loading this optional path — the
   *  source block renders faded and its upstream prereqs aren't loaded. */
  disabled: boolean;
  onToggle: (key: string) => void;
}

/** Dashed-bezier edge for an optional (Soft-wrapped) subtree, with a toggle
 *  pill at the bezier midpoint (REQ-10.1). The pill flips the soft branch:
 *  when disabled, the graph rebuild fades the source block and suppresses its
 *  upstream walk (REQ-10.2). */
export function OptionalEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<OptionalEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const disabled = data?.disabled === true;
  return (
    <>
      <path d={edgePath} fill="none" data-edge-variant="optional" className="react-flow__edge-path" />
      <EdgeLabelRenderer>
        <button
          type="button"
          data-toggle="soft-toggle"
          data-path={data?.softKey}
          aria-pressed={!disabled}
          aria-label={disabled ? "Show optional subtree" : "Hide optional subtree"}
          onClick={() => data?.onToggle?.(data?.softKey ?? "")}
          className="neu-raised bg-surface hover:bg-accent-subtle focus-visible:ring-primary/40 grid size-8 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
        >
          <Icon name={disabled ? "add" : "minimize"} size={14} />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
