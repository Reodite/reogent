"use client";

// One year column: label + a stack of TermSections (winter pair always,
// summer session when enabled), plus the per-year summer toggle. Summer
// presence is per-year — a co-op year may skip it while others keep it.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
  const reduceMotion = useReducedMotion();
  const indexedTerms = year.terms.map((term, index) => ({ term, index }));
  const winterTerms = indexedTerms.filter(({ term }) => !isSummer(term.season));
  const summerTerms = indexedTerms.filter(({ term }) => isSummer(term.season));
  const hasSummer = summerTerms.length > 0;
  const yearCredits = year.terms.reduce(
    (sum, t) => sum + t.blocks.reduce((n, b) => n + (courseIndex.get(b.code)?.credits ?? 0), 0),
    0,
  );

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <header className="flex h-8 shrink-0 items-baseline px-1">
        <h2 className="text-on-surface text-sm font-medium">{year.label}</h2>
        <span className="text-muted ml-auto w-12 text-right text-xs tabular-nums">{yearCredits} cr</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {winterTerms.map(({ term, index }) => (
            <TermSection
              key={term.season}
              yearId={year.id}
              termIdx={index}
              term={term}
              courseIndex={courseIndex}
              validations={validations}
            />
          ))}
        </div>
        <AnimatePresence initial={false}>
          {hasSummer && (
            <motion.div
              key="summer-terms"
              data-summer-terms
              initial={reduceMotion ? false : { opacity: 0, flexGrow: 0, marginTop: 0 }}
              animate={{ opacity: 1, flexGrow: 1, marginTop: 8 }}
              exit={{ opacity: 0, flexGrow: 0, marginTop: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex min-h-0 shrink basis-0 flex-col gap-2 overflow-hidden"
            >
              {summerTerms.map(({ term, index }) => (
                <TermSection
                  key={term.season}
                  yearId={year.id}
                  termIdx={index}
                  term={term}
                  courseIndex={courseIndex}
                  validations={validations}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <Button
          variant={hasSummer ? "danger" : "secondary"}
          size="toolbar"
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
          className="mt-2 w-full"
        >
          <Icon name={hasSummer ? "close" : "add"} size={13} />
          {hasSummer ? "Remove summer session" : "Add summer session"}
        </Button>
      </div>
    </section>
  );
}
