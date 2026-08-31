"use client";

import type { Term } from "@/src/lib/schedule/features/terms";

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
  return (
    <div className="neu-inset bg-surface-container-low flex rounded-full p-0.5" role="tablist" aria-label="Term">
      {terms.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === selected}
          onClick={() => onSelect(t.key)}
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
