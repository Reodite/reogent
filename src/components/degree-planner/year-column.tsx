"use client";

// One year column: just a label and a stack of TermSections. Term count
// is uniform across the whole planner (set in the sidebar Structure
// controls), so this component is presentation-only.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import type { Year } from "./planner-store";
import { TermSection } from "./term-section";
import type { BlockValidation } from "./validation";

interface YearColumnProps {
  year: Year;
  courseIndex: Map<string, CourseIndexEntry>;
  validations: Map<string, BlockValidation>;
  requirementCodes: Set<string>;
}

export function YearColumn({ year, courseIndex, validations, requirementCodes }: YearColumnProps) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <header className="shrink-0 px-1">
        <h3 className="text-on-surface text-sm font-semibold">{year.label}</h3>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {year.terms.map((term, idx) => (
          <TermSection
            key={`${year.id}-${term.season}`}
            yearId={year.id}
            termIdx={idx}
            term={term}
            courseIndex={courseIndex}
            validations={validations}
            requirementCodes={requirementCodes}
          />
        ))}
      </div>
    </section>
  );
}
