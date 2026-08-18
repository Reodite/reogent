import type { Citation } from "@/src/shared/citations/citation";
import { Children, type ReactNode } from "react";
import { CitationChip } from "./citation-chip";

const MARKER_RE = /\[(\d+)\]/g;

/** Replaces in-range `[N]` markers in the direct string children of a node
 * with `<CitationChip>` elements; out-of-range markers pass through as the
 * literal `[N]`. react-markdown's component overrides call this on their
 * `children` prop, so each listed element kind injects only its own direct
 * string leaves — no nested double-injection (REQ-13.4). */
export function injectChips(children: ReactNode, citations: Citation[] | null | undefined): ReactNode {
  if (!citations || citations.length === 0 || children == null || children === "") {
    return children;
  }
  let counter = 0;
  const injectString = (text: string): ReactNode[] => {
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(MARKER_RE)) {
      const idx = m.index ?? 0;
      if (idx > last) out.push(text.slice(last, idx));
      const n = Number(m[1]);
      if (n >= 1 && n <= citations.length) {
        out.push(<CitationChip key={`cite-${counter++}`} citation={citations[n - 1]} />);
      } else {
        out.push(m[0]);
      }
      last = idx + m[0].length;
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
