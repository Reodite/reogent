"use client";

import { SelectInput } from "@/src/components/ui/form-controls";
import { announce } from "@/src/components/ui/live-region";
import type { NeumorphicSurfaceToken } from "@/src/shared/color-tokens";
import { SEASON_META, usePlanner } from "./planner-store";

interface CoursePlacementSelectProps {
  mode: "add" | "move";
  code: string;
  blockId?: string;
  shadowOn?: NeumorphicSurfaceToken;
  onPlaced: () => void;
}

/** Adds or moves a course through the same undoable planner store commands as drag and drop. */
export function CoursePlacementSelect({
  mode,
  code,
  blockId,
  shadowOn = "surface",
  onPlaced,
}: CoursePlacementSelectProps) {
  const years = usePlanner((state) => state.years);
  const addBlock = usePlanner((state) => state.addBlock);
  const moveBlock = usePlanner((state) => state.moveBlock);

  let current: { yearId: string; termIndex: number } | null = null;
  if (blockId) {
    for (const year of years) {
      const termIndex = year.terms.findIndex((term) => term.blocks.some((block) => block.id === blockId));
      if (termIndex >= 0) {
        current = { yearId: year.id, termIndex };
        break;
      }
    }
  }

  return (
    <SelectInput
      autoFocus
      aria-label={`${mode === "add" ? "Add" : "Move"} ${code} to term`}
      defaultValue=""
      controlSize="compact"
      shadowOn={shadowOn}
      onChange={(event) => {
        const [yearIndexValue, termIndexValue] = event.target.value.split(":");
        const yearIndex = Number(yearIndexValue);
        const termIndex = Number(termIndexValue);
        const year = years[yearIndex];
        const term = year?.terms[termIndex];
        if (!year || !term || term.kind !== "study") return;

        if (mode === "add") addBlock(year.id, termIndex, code);
        else if (blockId) moveBlock(blockId, year.id, termIndex, term.blocks.length);
        else return;

        announce(`${mode === "add" ? "Added" : "Moved"} ${code} to ${year.label}, ${SEASON_META[term.season].short}.`);
        onPlaced();
      }}
    >
      <option value="">Choose a term…</option>
      {years.flatMap((year, yearIndex) =>
        year.terms.flatMap((term, termIndex) => {
          if (term.kind !== "study") return [];
          const isCurrent = current?.yearId === year.id && current.termIndex === termIndex;
          return (
            <option
              key={`${year.id}:${term.season}`}
              value={`${yearIndex}:${termIndex}`}
              disabled={mode === "move" && isCurrent}
            >
              {year.label} · {SEASON_META[term.season].short}
              {isCurrent ? " (current)" : ""}
            </option>
          );
        }),
      )}
    </SelectInput>
  );
}
