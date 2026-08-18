export type CalendarEventKind = "academic" | "holiday" | (string & {});

/** A single projected calendar event, surfaced by the REST route and
 * consumed by the calendar pane. */
export type CalendarEvent = {
  kind: CalendarEventKind;
  /** ISO "YYYY-MM-DD" anchored to UTC midnight. */
  date: string;
  label: string;
  /** Propagated from the originating KeyDateDoc, omitted entirely when
   * absent or empty (Property 19, REQ-12.3). */
  source_url: string | null;
  /** Sub-kind tags inferred from the event name (e.g. "exam",
   * "reading-week", "deadline", "term"). */
  tags: string[];
};
