"use client";

// Mini course search for the planner sidebar. Single input — accepts the
// same code/subject/filter syntax as the Course Finder (via parseQuery) but
// also falls through to substring matching on title so "linear algebra"
// surfaces MATH 152 etc. Results are LookupBlocks that drag straight into
// year-column terms.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { searchCourses } from "@/src/lib/planner-search";
import { useEffect, useMemo, useRef } from "react";
import { LookupBlock } from "./lookup-block";
import { usePlanner } from "./planner-store";

const RESULT_LIMIT = 20;

interface MiniCourseLookupProps {
  courseIndex: Map<string, CourseIndexEntry>;
}

export function MiniCourseLookup({ courseIndex }: MiniCourseLookupProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Lives in the persisted planner store so tab swaps keep the search.
  const query = usePlanner((s) => s.lookupQuery);
  const setQuery = usePlanner((s) => s.setLookupQuery);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const results = useMemo(() => {
    if (!query.trim()) return [] as CourseIndexEntry[];
    return searchCourses(courseIndex, query, RESULT_LIMIT);
  }, [query, courseIndex]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <h3 className="text-on-surface text-sm font-semibold">Find courses</h3>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Code or title (e.g. CPSC 110, linear algebra)"
        className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 w-full rounded-lg px-2 py-1.5 text-sm focus-visible:ring-2"
      />
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {query.trim() && results.length === 0 && <p className="text-muted text-xs italic">No matches.</p>}
        {results.map((entry) => (
          <LookupBlock key={entry.code} entry={entry} />
        ))}
      </div>
    </div>
  );
}
