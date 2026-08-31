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
  requirementCodes: Set<string>;
}

export function YearColumn({ year, courseIndex, validations, requirementCodes }: YearColumnProps) {
  const toggleSummer = usePlanner((s) => s.toggleSummer);
  const hasSummer = year.terms.some((t) => isSummer(t.season));

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <header className="flex shrink-0 items-baseline gap-2 px-1">
        <h3 className="text-on-surface text-sm font-semibold">{year.label}</h3>
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
            requirementCodes={requirementCodes}
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
          className={`flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-dashed px-2 py-1.5 text-[11px] transition-colors ${
            hasSummer
              ? "border-border text-muted hover:text-on-surface"
              : "border-border-subtle text-muted hover:border-primary/50 hover:text-primary"
          }`}
        >
          <Icon name={hasSummer ? "close" : "add"} size={12} />
          {hasSummer ? "Remove summer session" : "Add summer session (May–Aug)"}
        </button>
      </div>
    </section>
  );
}
