"use client";

import { announce } from "@/src/components/ui/live-region";
import type { Citation } from "@/src/shared/citations/citation";
import { safeSourceUrl } from "@/src/shared/citations/url";

/** Renders an in-range citation as a linked chip for safe HTTP(S) sources,
 * or a noninteractive span with a label tooltip when no safe URL exists.
 * The injector preserves out-of-range markers as literal text. */
export function CitationChip({ citation }: { citation: Citation }) {
  const label = citation.label;
  const url = safeSourceUrl(citation.source_url);
  if (url) {
    return (
      <a
        data-index={citation.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={label}
        onClick={() => announce(`Citation ${citation.index} opened`)}
        className="bg-primary-container/60 text-on-primary-container hover:bg-primary-container focus-visible:ring-primary/40 ml-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 align-super font-mono text-xs leading-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1"
      >
        [{citation.index}]
      </a>
    );
  }
  return (
    <span
      data-index={citation.index}
      title={label}
      className="bg-surface-container text-on-surface-variant ml-0.5 inline-flex cursor-help items-center rounded-full px-1.5 py-0.5 align-super font-mono text-xs leading-none"
    >
      [{citation.index}]
    </span>
  );
}
