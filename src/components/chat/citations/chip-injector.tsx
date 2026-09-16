import { citationMarkers, type Citation } from "@/src/shared/citations/citation";
import { Children, type ReactNode } from "react";
import { CitationChip } from "./citation-chip";

/** Replaces single and grouped citation markers in direct string children with chips.
 * Keeps out-of-range references literal and preserves groups without valid references.
 * Markdown overrides inject only their own direct string leaves to avoid nested injection. */
export function injectChips(children: ReactNode, citations: Citation[] | null | undefined): ReactNode {
  if (!Array.isArray(citations) || citations.length === 0 || children == null || children === "") {
    return children;
  }
  let counter = 0;
  const injectString = (text: string): ReactNode[] => {
    const out: ReactNode[] = [];
    let last = 0;
    for (const marker of citationMarkers(text)) {
      if (marker.start > last) out.push(text.slice(last, marker.start));
      const group = marker.references.map((reference) => {
        const index = Number(reference);
        return index >= 1 && index <= citations.length ? (
          <CitationChip key={`cite-${counter++}`} citation={citations[index - 1]} />
        ) : (
          `[${reference}]`
        );
      });
      if (group.some((reference) => typeof reference !== "string")) out.push(...group);
      else out.push(marker.text);
      last = marker.start + marker.text.length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  };

  if (typeof children === "string") return injectString(children);
  if (Array.isArray(children)) {
    return Children.map(children, (child) => (typeof child === "string" ? injectString(child) : child));
  }
  return children;
}
