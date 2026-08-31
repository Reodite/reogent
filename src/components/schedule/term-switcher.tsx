"use client";

import type { Term } from "@/src/lib/schedule/features/terms";
import type { KeyboardEvent } from "react";

interface Props {
  terms: Term[];
  selected: string | null;
  onSelect: (key: string) => void;
}

export function TermSwitcher({ terms, selected, onSelect }: Props) {
  if (terms.length === 0) return null;
  if (terms.length === 1) {
    return <span className="text-muted text-xs font-medium">{terms[0].label}</span>;
  }
  const activeIndex = Math.max(
    0,
    terms.findIndex((term) => term.key === selected),
  );

  function moveTermTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % terms.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + terms.length) % terms.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = terms.length - 1;
    else return;
    event.preventDefault();
    onSelect(terms[next].key);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div className="neu-inset bg-surface-container-low flex rounded-full p-0.5" role="tablist" aria-label="Term">
      {terms.map((t, index) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          tabIndex={index === activeIndex ? 0 : -1}
          aria-selected={t.key === selected}
          onClick={() => onSelect(t.key)}
          onKeyDown={(event) => moveTermTab(event, index)}
          className={`min-h-8 rounded-full px-3 text-xs font-medium transition-colors ${
            t.key === selected ? "neu-panel text-on-surface" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
