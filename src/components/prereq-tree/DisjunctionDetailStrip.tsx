import type { SelectionKeyMap } from "../selection-key";

export interface DisjunctionDetail {
  selectionKey: string;
  path: string;
  /** Pre-resolved option descriptions — course title, the "(not in calendar)"
   *  sentinel for unknown courses, or literal prose. The pane assembles these
   *  from the graph; the strip only paints the selected one (REQ-9.3). */
  options: string[];
}

/** Horizontal scrollable strip beneath the canvas showing each disjunction's
 *  selected option description (REQ-9.3). Absent selection keys default to
 *  child index 0 (Property 17). Renders nothing when there are no disjunctions. */
export function DisjunctionDetailStrip({
  disjunctions,
  selections,
}: {
  disjunctions: DisjunctionDetail[];
  selections: SelectionKeyMap;
}) {
  if (disjunctions.length === 0) return null;
  return (
    <div
      data-disjunction-strip
      className="border-border-subtle/60 text-muted flex gap-2 overflow-x-auto border-t pt-2 text-xs"
    >
      {disjunctions.map((d) => {
        const label = d.options[selections[d.selectionKey] ?? 0] ?? d.options[0] ?? "(none)";
        return (
          <span key={d.selectionKey} className="whitespace-nowrap">
            <span className="text-on-surface-variant font-mono">{d.path}</span>:{" "}
            <span className="text-on-surface">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
