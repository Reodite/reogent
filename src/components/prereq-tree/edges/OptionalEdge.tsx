"use client";

import { Icon } from "@/src/components/icons";
import { EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow";

export interface OptionalEdgeData {
  /** Soft-path keying the per-subtree toggle (root soft = ""). */
  path: string;
  softToggled?: boolean;
  onToggle?: (path: string) => void;
}

/** Dashed-bezier edge for an optional (Soft-wrapped) subtree, with a soft-toggle
 *  pill at the bezier midpoint (REQ-10.1). The pill flips the pane's
 *  `softToggles[path]`; the pane filters the wrapped subtree's edges when the
 *  toggle is off (REQ-10.2). The node label is invariant under the toggle
 *  (Property 10). */
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
  const on = data?.softToggled === true;
  return (
    <>
      <path
        d={edgePath}
        fill="none"
        data-edge-variant="optional"
        style={{ strokeDasharray: "6 4" }}
        className="react-flow__edge-path"
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          data-toggle="soft-toggle"
          data-path={data?.path}
          aria-pressed={on}
          aria-label={on ? "Hide optional subtree" : "Show optional subtree"}
          onClick={() => data?.onToggle?.(data?.path ?? "")}
          className="neu-raised bg-surface hover:bg-accent-subtle focus-visible:ring-primary/40 grid size-7 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
        >
          <Icon name={on ? "minimize" : "add"} size={14} />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
