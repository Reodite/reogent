"use client";

// "Plan structure" preferences block — year count + terms per year. Lives
// at the top of the Info sidebar tab so the structural controls are grouped
// with the program selectors. Shrinking either dimension can drop already-
// planned blocks, so both selectors guard the change with a confirm naming
// the loss.
import { MAX_TERMS, MAX_YEARS, MIN_TERMS, MIN_YEARS, usePlanner } from "./planner-store";

const SELECT_CLASS =
  "neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 rounded-lg px-2 py-1 text-sm focus-visible:ring-2";

export function PlanStructure() {
  const years = usePlanner((s) => s.years);
  const termsPerYear = usePlanner((s) => s.termsPerYear);
  const setYearCount = usePlanner((s) => s.setYearCount);
  const setTermsPerYear = usePlanner((s) => s.setTermsPerYear);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-on-surface text-sm font-semibold">Structure</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-on-surface-variant text-xs">Years</span>
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
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-on-surface-variant text-xs">Terms</span>
          <select
            value={termsPerYear}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (next >= termsPerYear) {
                setTermsPerYear(next);
                return;
              }
              const droppedBlocks = years.reduce(
                (n, y) => n + y.terms.slice(next).reduce((m, t) => m + t.blocks.length, 0),
                0,
              );
              if (
                droppedBlocks > 0 &&
                !window.confirm(
                  `Reducing to ${next} term${next === 1 ? "" : "s"} per year will discard ${droppedBlocks} planned course(s). Continue?`,
                )
              ) {
                return;
              }
              setTermsPerYear(next);
            }}
            className={SELECT_CLASS}
          >
            {Array.from({ length: MAX_TERMS - MIN_TERMS + 1 }, (_, i) => MIN_TERMS + i).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
