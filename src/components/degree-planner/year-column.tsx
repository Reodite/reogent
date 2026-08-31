"use client";

// One year column: label + a stack of TermSections (winter pair always,
// summer session when enabled), plus the per-year summer toggle. Summer
// presence is per-year — a co-op year may skip it while others keep it.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { Icon } from "@/src/components/icons";
import { isSummer, usePlanner, type Year } from "./planner-store";
import { TermSection } from "./term-section";
import type { BlockValidation } from "./validation";

interface YearColumnProps {
  year: Year;
  courseIndex: Map<string, CourseIndexEntry>;
  validations: Map<string, BlockValidation>;
}

export function YearColumn({ year, courseIndex, validations }: YearColumnProps) {
  const toggleSummer = usePlanner((s) => s.toggleSummer);
  const hasSummer = year.terms.some((t) => isSummer(t.season));
  const yearCredits = year.terms.reduce(
    (sum, t) => sum + t.blocks.reduce((n, b) => n + (courseIndex.get(b.code)?.credits ?? 0), 0),
    0,
  );

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <header className="flex h-8 shrink-0 items-baseline px-1">
        <h3 className="text-on-surface text-sm font-medium">{year.label}</h3>
        <span className="text-muted ml-auto w-12 text-right text-xs tabular-nums">{yearCredits} cr</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {year.terms.map((term, idx) => (
          <TermSection
            key={term.season}
            yearId={year.id}
            termIdx={idx}
            term={term}
            courseIndex={courseIndex}
            validations={validations}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            if (hasSummer) {
              const summerBlocks = year.terms
                .filter((t) => isSummer(t.season))
                .reduce((n, t) => n + t.blocks.length, 0);
              if (
                summerBlocks > 0 &&
                !window.confirm(`Removing Summer will discard ${summerBlocks} course(s). Continue?`)
              ) {
                return;
              }
            }
            toggleSummer(year.id);
          }}
          className="neu-button text-muted hover:text-on-surface flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg text-xs"
        >
          <Icon name={hasSummer ? "close" : "add"} size={13} />
          {hasSummer ? "Remove summer session" : "Add summer session"}
        </button>
      </div>
    </section>
  );
}
