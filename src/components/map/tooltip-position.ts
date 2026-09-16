import type { CSSProperties } from "react";

const OFFSET = 12;
const EDGE = 8;

/** Keeps a building tooltip within the map, including narrow canvas panes. */
export function tooltipPosition(
  point: { x: number; y: number },
  container: { clientWidth: number; clientHeight: number } | null,
): CSSProperties {
  const width = container?.clientWidth ?? 800;
  const height = container?.clientHeight ?? 600;
  const tooltipWidth = Math.min(240, Math.max(0, width - EDGE * 2));
  const fitsRight = point.x + OFFSET + tooltipWidth <= width - EDGE;
  const left = fitsRight ? point.x + OFFSET : point.x - OFFSET - tooltipWidth;
  const fitsBelow = point.y + OFFSET + 56 <= height - EDGE;

  return {
    left: Math.max(EDGE, Math.min(left, width - EDGE - tooltipWidth)),
    maxWidth: tooltipWidth,
    top: fitsBelow ? Math.max(EDGE, point.y + OFFSET) : undefined,
    bottom: fitsBelow ? undefined : Math.max(EDGE, height - point.y + OFFSET),
  };
}
