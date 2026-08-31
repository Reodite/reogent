"use client";

// Plan-wide structure controls: year count, co-op participation, and a
// faculty-specific co-op sequence helper. Summer sessions and work terms
// remain editable on the board.
import { applyCoopSequence, COOP_SUPPORT } from "@/src/lib/coop";
import { MAX_YEARS, MIN_YEARS, usePlanner } from "./planner-store";

const SELECT_CLASS =
  "neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 rounded-lg px-2 py-1 text-sm focus-visible:ring-2";

export function PlanStructure() {
  const years = usePlanner((s) => s.years);
  const setYearCount = usePlanner((s) => s.setYearCount);
  const faculty = usePlanner((s) => s.faculty);
  const coop = usePlanner((s) => s.coop);
  const setCoop = usePlanner((s) => s.setCoop);

  // Co-op support uses the faculty names derived by the program index.
  const coopInfo = faculty ? COOP_SUPPORT[faculty] : undefined;

  return (
    <div className="flex w-64 flex-col gap-3">
      <label className="flex items-center justify-between gap-2 text-sm">
        <span className="text-on-surface-variant text-xs">Years in plan</span>
        <select
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
          className={SELECT_CLASS}
        >
          {Array.from({ length: MAX_YEARS - MIN_YEARS + 1 }, (_, i) => MIN_YEARS + i).map((n) => (
            <option key={n} value={n}>
              {n} years
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary"
            checked={coop}
            disabled={faculty != null && coopInfo == null}
            onChange={(e) => setCoop(e.target.checked)}
          />
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
              onClick={() => applyCoopSequence(faculty)}
              className="neu-button bg-surface text-on-surface-variant hover:text-on-surface rounded-lg px-2 py-1 text-left text-xs"
            >
              Apply typical {coopInfo.shortLabel} sequence
            </button>
          </>
        )}
      </div>

      <p className="text-muted text-[11px]">
        Summer sessions and individual work terms are toggled on the board (“+ Summer” under a year, briefcase icon in a
        term header).
      </p>
    </div>
  );
}
