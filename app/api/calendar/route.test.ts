import fixture from "@/__fixtures__/calendar-events.json";
import { GET, projectCalendarEvents, projectCampusEvents } from "@/app/api/calendar/route";
import type { KeyDateDoc } from "@/src/server/modules/calendar";
import type { EventDoc } from "@/src/server/modules/events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const input = fixture.input as KeyDateDoc[];
const expected = fixture.output;

vi.mock("@/src/server/search", () => {
  const hitsRef: { current: KeyDateDoc[] } = { current: [] };
  return {
    getSearch: () => ({
      index: () => ({
        async search(_q: string, opts?: { filter?: string }) {
          const filter = opts?.filter ?? "";
          // Honor the kind expression the route emits for `kinds=academic`.
          const kinds = Array.from(filter.matchAll(/kind = "(\w+)"/g)).map((m) => m[1]);
          return {
            hits: kinds.length === 0 ? hitsRef.current : hitsRef.current.filter((d) => kinds.includes(d.kind)),
          };
        },
      }),
    }),
    __setHits: (next: KeyDateDoc[]) => {
      hitsRef.current = next;
    },
  };
});

const setSearchHits = (await import("@/src/server/search")).__setHits as (n: KeyDateDoc[]) => void;

beforeEach(() => {
  setSearchHits(input);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("projectCalendarEvents — calendar server projection (REQ-16.1)", () => {
  it("drops rows without a usable start date", () => {
    const out = projectCalendarEvents(input);
    expect(out.find((e) => e.label.includes("To be confirmed by Senate"))).toBeUndefined();
  });

  it("emits school kinds verbatim, holiday tags stay empty", () => {
    const holidays = out(input).filter((e) => e.kind === "holiday");
    for (const e of holidays) {
      expect(e.tags).toEqual([]);
      expect(e.kind).toBe("holiday");
    }
  });

  it("carries source_url from the originating KeyDateDoc", () => {
    const byLabel = new Map(out(input).map((e) => [e.label, e]));
    expect(byLabel.get("Family Day")?.source_url).toBe("https://www.statutoryholidays.com/");
    expect(byLabel.get("Last day to withdraw from Winter Term 1 courses with a W on transcript")?.source_url).toBe(
      "https://students.ubc.ca/enrolled/important-dates",
    );
  });

  it('infers the multi-tag set ["reading-week","exam","term"] on the mid-term + reading-week concludes event', () => {
    const midTerm = out(input).find((e) => e.label.includes("Mid-term examinations + reading week concludes"));
    expect(midTerm?.tags).toEqual(["reading-week", "exam", "term"]);
  });
  it("keeps academic events on the same day as siblings (multi-event day)", () => {
    const nov29 = projectCalendarEvents(input).filter((e) => e.date === "2024-11-29");
    expect(nov29).toHaveLength(2);
    expect(nov29.map((e) => e.label).sort()).toEqual([
      "Last day of classes, Winter Term 1",
      "Last day to withdraw from Winter Term 1 courses with a W on transcript",
    ]);
  });
  it("honours the from/to filter window", () => {
    const windowed = projectCalendarEvents(input, "2024-09-01", "2024-09-30");
    expect(windowed.map((e) => e.date)).toEqual(["2024-09-02", "2024-09-03", "2024-09-17", "2024-09-30"]);
  });

  it("orders events by ascending ISO date", () => {
    const dates = out(input).map((e) => e.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it("snapshot-matches the full projected output against the fixture for the 2024-2025 academic year", () => {
    expect(out(input)).toEqual(expected);
  });
});

function out(docs: KeyDateDoc[]) {
  return projectCalendarEvents(docs);
}

describe("projectCampusEvents — campus events as per-day event-kind entries", () => {
  const base: EventDoc = {
    id: "1",
    title: "Talk",
    text: "",
    url: "https://events.ubc.ca/event/talk",
    start_date: "2026-09-03 18:00:00",
    end_date: "2026-09-03 19:00:00",
    all_day: false,
    venue: null,
    venue_address: null,
    categories: ["Lectures & Talks"],
  };

  it("emits one entry per day, clipped to the window, capped at 14 days, skipping rows without a start", () => {
    expect(projectCampusEvents([base])).toEqual([
      { kind: "event", date: "2026-09-03", label: "Talk", source_url: base.url, tags: ["Lectures & Talks"] },
    ]);
    const long = projectCampusEvents([{ ...base, end_date: "2026-12-01 00:00:00" }]);
    expect(long).toHaveLength(14);
    expect(long[13].date).toBe("2026-09-16");
    const clipped = projectCampusEvents([{ ...base, end_date: "2026-09-05 00:00:00" }], "2026-09-04", "2026-09-04");
    expect(clipped.map((e) => e.date)).toEqual(["2026-09-04"]);
    expect(projectCampusEvents([{ ...base, end_date: "2026-09-01 00:00:00" }])).toHaveLength(1);
    expect(projectCampusEvents([{ ...base, start_date: null }])).toEqual([]);
  });

  it("emits semantically duplicate source records once", () => {
    const duplicate = { ...base, id: "2", url: "https://events.ubc.ca/event/talk-2" };

    expect(projectCampusEvents([base, duplicate])).toEqual([
      { kind: "event", date: "2026-09-03", label: "Talk", source_url: base.url, tags: ["Lectures & Talks"] },
    ]);
  });
});

describe("GET /api/calendar route — projected CalendarEvent[] shape and caching (REQ-16.1)", () => {
  it("returns the projected array with a 5-minute public cache header", async () => {
    const request = new Request("https://example/api/calendar?kinds=academic");
    const res = await GET(request);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = (await res.json()) as ReturnType<typeof projectCalendarEvents>;
    expect(body).toEqual(fixture.academicOnly);
  });
});
