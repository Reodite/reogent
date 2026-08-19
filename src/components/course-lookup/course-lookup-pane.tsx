"use client";

import { CourseDetailCard } from "@/src/components/course-lookup/course-detail-card";
import { CourseSearchField, useCourseAutocomplete } from "@/src/components/course-lookup/course-search";
import { useApi } from "@/src/components/providers";
import type { PaneState } from "@/src/components/shell/pane-registry";
import { useEffect, useState } from "react";

export function CourseLookupPane({ state, setState }: { state: PaneState; setState: (s: Partial<PaneState>) => void }) {
  const api = useApi();
  const [code, setCode] = useState(((state.code as string | undefined) ?? "") as string);
  const { list, status, error, rejected, record, lookup } = useCourseAutocomplete(code, {
    resolveSingle: (c) => api.getCourse(c),
  });

  useEffect(() => {
    const trimmed = code.trim();
    if (trimmed) setState({ code: trimmed });
  }, [code, setState]);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <CourseSearchField
        value={code}
        onChange={setCode}
        onSelect={setCode}
        onRetry={() => lookup(code)}
        status={status}
        list={list}
        error={error}
        rejected={rejected}
      />
      {record && <CourseDetailCard record={record} />}
    </div>
  );
}
