"use client";

import type { Citation } from "@/src/shared/citations/citation";

/** Renders a single in-range citation as a superscript chip. Anchored
 * (`<a>`) when `source_url` is present (REQ-13.1); a non-clickable `<span>`
 * with a `label` tooltip when absent (REQ-13.2). Out-of-range `[N]` markers
 * are handled by the injector (kept as literal text, REQ-13.3). */
export function CitationChip({ citation }: { citation: Citation }) {
  const label = citation.label;
  if (citation.source_url) {
    return (
      <a
        data-index={citation.index}
        href={citation.source_url}
        target="_blank"
        rel="noopener noreferrer"
        title={label}
        className="bg-primary-container/60 text-on-primary-container hover:bg-primary-container focus-visible:ring-primary/40 ml-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 align-super font-mono text-[0.625em] leading-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1"
      >
        [{citation.index}]
      </a>
    );
  }
  return (
    <span
      data-index={citation.index}
      title={label}
      className="bg-surface-container text-on-surface-variant ml-0.5 inline-flex cursor-help items-center rounded-full px-1.5 py-0.5 align-super font-mono text-[0.625em] leading-none"
    >
      [{citation.index}]
    </span>
  );
}
