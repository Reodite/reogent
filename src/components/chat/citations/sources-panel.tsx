"use client";

import { Icon } from "@/src/components/icons";
import { announce } from "@/src/components/ui/live-region";
import type { Citation } from "@/src/shared/citations/citation";
import { useReducedMotion } from "motion/react";
import { useRef } from "react";

export function SourcesPanel({ citations }: { citations: Citation[] | null | undefined }) {
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  if (!Array.isArray(citations) || citations.length === 0) return null;

  const used = citations.filter((c) => c.used);
  const unused = citations.filter((c) => !c.used);

  const handleToggle = (e: React.ToggleEvent<HTMLDetailsElement>) => {
    if (e.currentTarget.open) {
      ref.current?.scrollIntoView({
        block: "nearest",
        behavior: reducedMotion ? "auto" : "smooth",
      });
      announce("Sources panel expanded");
    } else {
      announce("Sources panel collapsed");
    }
  };

  return (
    <aside ref={ref} data-sources-panel className="mt-2">
      <details onToggle={handleToggle}>
        <summary className="focus-visible:ring-primary/40 hover:bg-surface-container/60 inline-flex min-h-11 list-none items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium select-none focus-visible:ring-2 focus-visible:ring-offset-1 [&::-webkit-details-marker]:hidden">
          <Icon name="down" size={14} className="transition-transform open:rotate-180" />
          {used.length > 0 ? `Sources used (${used.length})` : `Other retrieved context (${unused.length})`}
        </summary>
        <div className="bg-surface-container-low mt-2 flex max-h-64 flex-col gap-1.5 overflow-auto rounded-lg px-3 pt-1 pb-3">
          {used.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {used.map((c) => (
                <SourceRow key={c.index} c={c} />
              ))}
            </ul>
          )}
          {unused.length > 0 && (
            <>
              {used.length > 0 && (
                <div className="text-on-surface-variant pt-1 text-xs font-medium tracking-[0.05em] uppercase">
                  Other retrieved context
                </div>
              )}
              <ul className="flex flex-col gap-1.5">
                {unused.map((c) => (
                  <SourceRow key={c.index} c={c} />
                ))}
              </ul>
            </>
          )}
        </div>
      </details>
    </aside>
  );
}

function SourceRow({ c }: { c: Citation }) {
  return (
    <li
      data-citation-row={c.index}
      data-used={c.used ? "true" : "false"}
      className="flex min-w-0 items-start gap-1.5 text-xs"
    >
      <span className="text-muted shrink-0 font-mono">{c.index}.</span>
      <div className="flex min-w-0 flex-col">
        <span className={c.used ? "text-on-surface" : "text-muted"}>{c.label}</span>
        {c.source_url && (
          <a
            href={c.source_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open source"
            className="text-primary hover:text-primary/80 inline-flex min-h-11 min-w-11 items-center text-xs underline sm:min-h-9"
          >
            Source
          </a>
        )}
      </div>
    </li>
  );
}
