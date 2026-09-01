"use client";

// Plan-wide structure controls: year count, co-op participation, and a
// faculty-specific co-op sequence helper. Summer sessions and work terms
// remain editable on the board.
import { SelectInput } from "@/src/components/ui/form-controls";
import { applyCoopSequence, COOP_SUPPORT } from "@/src/lib/coop";
import { useState } from "react";
import { PlannerCheckboxMark } from "./planner-checkbox";
import { MAX_YEARS, MIN_YEARS, usePlanner } from "./planner-store";

export function PlanStructure() {
  const years = usePlanner((s) => s.years);
  const setYearCount = usePlanner((s) => s.setYearCount);
  const faculty = usePlanner((s) => s.faculty);
  const coop = usePlanner((s) => s.coop);
  const setCoop = usePlanner((s) => s.setCoop);
  const [sequenceMessage, setSequenceMessage] = useState<string | null>(null);

  // Co-op support uses the faculty names derived by the program index.
  const coopInfo = faculty ? COOP_SUPPORT[faculty] : undefined;

  return (
    <div className="flex w-64 flex-col gap-3">
      <label htmlFor="planner-year-count" className="flex items-center justify-between gap-2 text-sm">
        <span className="text-on-surface-variant text-xs">Years in plan</span>
        <SelectInput
          id="planner-year-count"
          value={years.length}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (next >= years.length) {
              setYearCount(next);
              return;
            }
            const droppedBlocks = years
              .slice(next)
              .reduce((n, y) => n + y.terms.reduce((m, t) => m + t.blocks.length, 0), 0);
            if (
              droppedBlocks > 0 &&
              !window.confirm(`Reducing to ${next} years will discard ${droppedBlocks} planned course(s). Continue?`)
            ) {
              return;
            }
            setYearCount(next);
          }}
          controlSize="compact"
          width="auto"
        >
          {Array.from({ length: MAX_YEARS - MIN_YEARS + 1 }, (_, i) => MIN_YEARS + i).map((n) => (
            <option key={n} value={n}>
              {n} years
            </option>
          ))}
        </SelectInput>
      </label>

      <div className="flex flex-col gap-1">
        <label
          className={`hover:bg-surface-container-low flex min-h-11 items-center gap-1 rounded-lg px-1 text-left ${
            !coopInfo && !coop ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          }`}
        >
          <input
            type="checkbox"
            className="peer sr-only"
            checked={coop}
            disabled={!coopInfo && !coop}
            onChange={(event) => {
              setCoop(event.target.checked);
              setSequenceMessage(null);
            }}
          />
          <PlannerCheckboxMark checked={coop} />
          <span className="text-on-surface text-xs">Co-op program</span>
        </label>
        {faculty == null && <p className="text-muted text-[11px]">Select a faculty to check co-op availability.</p>}
        {faculty != null && coopInfo == null && (
          <p className="text-muted text-[11px]">This faculty has no co-op program.</p>
        )}
        {faculty != null && coopInfo != null && coop && (
          <>
            <p className="text-muted text-[11px]">{coopInfo.blurb}</p>
            <button
              type="button"
              onClick={() => {
                const result = applyCoopSequence(faculty);
                setSequenceMessage(
                  result?.skippedTerms
                    ? `Applied the sequence and kept ${result.skippedTerms} occupied term(s) unchanged.`
                    : "Applied the co-op sequence. You can edit each work term on the board.",
                );
              }}
              className="neu-button bg-surface text-on-surface-variant hover:text-on-surface rounded-lg px-2 py-1 text-left text-xs"
            >
              Apply typical {coopInfo.shortLabel} sequence
            </button>
            {sequenceMessage && (
              <p className="text-on-surface-variant text-[11px]" role="status">
                {sequenceMessage}
              </p>
            )}
          </>
        )}
      </div>

      <p className="text-muted text-[11px]">
        Add summer sessions beneath a year. Use “Mark as co-op work term” inside any study term to customize the
        sequence.
      </p>
    </div>
  );
}
