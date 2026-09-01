"use client";

import type { KeyboardEvent } from "react";

interface TermOption {
  key: string;
  label: string;
}

interface Props {
  terms: TermOption[];
  selected: string | null;
  onSelect: (key: string) => void;
}

export function TermSwitcher({ terms, selected, onSelect }: Props) {
  if (terms.length === 0) return null;

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
    <div
      data-schedule-term-switcher
      className="neu-inset bg-surface-container-low flex w-max gap-1 rounded-lg p-1"
      role="tablist"
      aria-label="Term"
    >
      {terms.map((term, index) => (
        <button
          key={term.key}
          type="button"
          role="tab"
          tabIndex={index === activeIndex ? 0 : -1}
          aria-selected={term.key === selected}
          onClick={() => onSelect(term.key)}
          onKeyDown={(event) => moveTermTab(event, index)}
          className={`focus-visible:ring-primary/40 min-h-8 shrink-0 rounded-md px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 ${
            term.key === selected
              ? "bg-surface text-on-surface"
              : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
          }`}
        >
          {term.label}
        </button>
      ))}
    </div>
  );
}
