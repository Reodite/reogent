export type CitationKind = "course" | "program" | "event" | "calendar" | "page" | "generic" | (string & {});

/** A single source attributed to an assistant response, allocated by the
 * citations server and rendered as a chip by the client. */
export type Citation = {
  /** 1-indexed position in the response's citation array (Property 18). */
  index: number;
  label: string;
  kind: CitationKind;
  /** True only after `stampUsed` has matched `[index]` in the final text. */
  used: boolean;
  /** Omitted entirely when absent or empty (Property 19, REQ-12.3). */
  source_url?: string;
  /** Originating tool name. */
  tool: string;
  /** Optional provenance payload for the Sources panel tooltip. */
  detail?: { subject?: string; number?: string; date?: string };
};
