"use client";

import { getBezierPath, type EdgeProps } from "reactflow";

/** Solid-bezier edge for a hard (required) prerequisite link (REQ-10.1).
 *  Carries `data-edge-variant="hard"` for the property-oracle contract. */
export function HardEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return <path d={edgePath} fill="none" data-edge-variant="hard" className="react-flow__edge-path" />;
}
