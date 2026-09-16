export type CitationKind = "course" | "program" | "event" | "calendar" | "page" | "generic" | (string & {});

/** A single source attributed to an assistant response, allocated by the
 * citations server and rendered as a chip by the client. */
export type Citation = {
  /** 1-indexed position in the response's citation array (Property 18). */
  index: number;
  label: string;
  kind: CitationKind;
  /** True after `stampUsed` finds this index in a final-text citation marker. */
  used: boolean;
  /** Omitted entirely when absent or empty (Property 19, REQ-12.3). */
  source_url?: string;
  /** Originating tool name. */
  tool: string;
  /** Optional provenance payload for the Sources panel tooltip. */
  detail?: {
    subject?: string;
    number?: string;
    date?: string;
    category?: string;
    retrieved_at?: string;
    source_modified_at?: string;
    source_context_required?: boolean;
  };
};

/** Finds single and comma-separated numeric markers in plain text.
 * Preserves offsets and digit strings for literal invalid-reference fallback. */
export function* citationMarkers(text: string) {
  for (const match of text.matchAll(/\[[ \t]*(\d+(?:[ \t]*,[ \t]*\d+)*)[ \t]*\]/g)) {
    yield {
      start: match.index,
      text: match[0],
      references: match[1].split(",").map((reference) => reference.trim()),
    };
  }
}
