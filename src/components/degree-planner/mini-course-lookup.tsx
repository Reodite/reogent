"use client";

// Course search for the planner rail. It accepts Course Finder syntax and
// title substrings, then exposes draggable results for the year columns.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { searchCourses } from "@/src/lib/planner-search";
import { useMemo } from "react";
import { LookupBlock } from "./lookup-block";
import { usePlanner } from "./planner-store";

const RESULT_LIMIT = 20;

interface MiniCourseLookupProps {
  courseIndex: Map<string, CourseIndexEntry>;
}

export function MiniCourseLookup({ courseIndex }: MiniCourseLookupProps) {
  // The persisted query survives planner remounts.
  const query = usePlanner((s) => s.lookupQuery);
  const setQuery = usePlanner((s) => s.setLookupQuery);

  const results = useMemo(() => {
    if (!query.trim()) return [] as CourseIndexEntry[];
    return searchCourses(courseIndex, query, RESULT_LIMIT);
  }, [query, courseIndex]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-baseline gap-2 px-4">
        <h3 className="text-on-surface text-sm font-medium">Find courses</h3>
        <span className="text-muted text-[11px]">Drag a result onto any term.</span>
      </header>
      <div className="shrink-0 px-4 pb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by code or title (e.g. CPSC 110)"
          className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 h-9 w-full rounded-lg px-3 text-sm focus-visible:ring-2"
        />
      </div>
      <div className="border-border-subtle flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto border-t px-2 py-2">
        {!query.trim() && (
          <p className="text-muted px-2 py-6 text-center text-xs">Search above, then drag a course onto the board.</p>
        )}
        {query.trim() && results.length === 0 && (
          <p className="text-muted px-2 py-6 text-center text-xs">No courses match &ldquo;{query.trim()}&rdquo;.</p>
        )}
        {results.map((entry) => (
          <LookupBlock key={entry.code} entry={entry} />
        ))}
      </div>
    </div>
  );
}
