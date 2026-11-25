/**
 * Returns the index that an Arrow, Home, or End key moves to in a wrapping list of `count` items.
 * Horizontal lists use Left/Right arrows; vertical lists use Up/Down. Returns null for other keys.
 */
export function rovingIndex(key: string, index: number, count: number, axis: "horizontal" | "vertical"): number | null {
  const [previous, next] = axis === "horizontal" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  if (key === next) return (index + 1) % count;
  if (key === previous) return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
