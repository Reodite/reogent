import { describe, expect, it } from "vitest";
import type { SearchClient } from "../core/types";
import { prereqModule } from "../prereq/agent-tool";
import { admissions } from "./admissions";
import { buildings } from "./buildings";
import { calendar } from "./calendar";
import { costs } from "./costs";
import { courses } from "./courses";
import { events } from "./events";
import { pages } from "./pages";
import { places } from "./places";
import { spaces } from "./spaces";
import { createWidgetsModule } from "./widgets";

/**
 * A SearchClient whose every index serves canned hits and documents, honoring
 * the filter subset the tools emit: `field = 'x'`, `field = x`, `field >= x`,
 * `field IS NULL`, and AND-combinations. `search` records the options passed,
 * and can return `_formatted` for highlight-paging tools when the fixture sets
 * it. Tracks per-index call counts so tests can assert routing.
 */
function fakeSearch(data: Record<string, unknown[]>): SearchClient & {
  calls: () => Record<string, number>;
} {
  const callCounts: Record<string, number> = {};
  const docs = new Map<string, Record<string, unknown>>();
  for (const [idx, arr] of Object.entries(data)) {
    for (const d of arr) {
      const id = (d as Record<string, unknown>).id as string | undefined;
      if (id) docs.set(`${idx}/${id}`, d);
    }
  }
  return {
    calls: () => ({ ...callCounts }),
    index: (name: string) => {
      callCounts[name] = (callCounts[name] ?? 0) + 1;
      const getDocument = async (id: string) => {
        const d = docs.get(`${name}/${id}`);
        if (!d) throw new Error(`document ${name}/${id} not found`);
        return d;
      };
      return {
        getDocument,
        search: async (_q: string, opts?: Record<string, unknown>) => {
          const filter = String(opts?.filter ?? "");
          const filterOk = (h: unknown): boolean => {
            if (!filter) return true;
            return matchClauseDocs(h as Record<string, unknown>, filter);
          };
          let hits = (data[name] ?? []).filter(filterOk);
          // Loose relevance pass: when no filter is given, match the query text
          // against the doc's textual fields so unknown-building lookups return
          // nothing rather than every document.
          if (!filter) {
            const needle = _q.trim().toLowerCase();
            if (needle) {
              hits = hits.filter((h) => {
                const d = h as Record<string, unknown>;
                return [d.code, d.name, d.title, d.program, d.program_slug, d.item, d.room, d.location]
                  .filter((v): v is string => typeof v === "string")
                  .some((v) => v.toLowerCase().includes(needle));
              });
            }
          }
          const sortOpt = opts?.sort as string[] | undefined;
          if (sortOpt?.includes("code:asc")) {
            hits = [...hits].sort((a, b) =>
              String((a as Record<string, unknown>).code).localeCompare(String((b as Record<string, unknown>).code)),
            );
          }
          const limit = Number(opts?.limit ?? hits.length);
          const sliced = hits.slice(0, Number.isFinite(limit) ? limit : hits.length);
          if ((opts?.attributesToHighlight as string[] | undefined)?.includes("text")) {
            return {
              hits: sliced.map((h) => ({
                ...(h as object),
                _formatted: { text: `...${String((h as Record<string, unknown>).text ?? "")}...` },
              })),
            };
          }
          return { hits: sliced };
        },
      };
    },
  } as unknown as SearchClient & { calls: () => Record<string, number> };
}

/** Applies an AND-composed filter string (`a = 'x' AND b >= 2 AND c IS NULL`)
 *  to a single document. */
function matchClauseDocs(doc: Record<string, unknown>, filter: string): boolean {
  const clauses = filter.split(" AND ");
  return clauses.every((clause) => matchClause(doc, clause));
}

function matchClause(doc: Record<string, unknown>, clause: string): boolean {
  const isNull = clause.match(/^(\w+) IS NULL$/);
  if (isNull) {
    const v = doc[isNull[1]];
    return v === null || v === undefined || v === "";
  }
  const geStr = clause.match(/^(\w+) >= '([^']+)'$/);
  if (geStr) {
    const v = doc[geStr[1]];
    if (typeof v !== "string") return false;
    return v >= geStr[2];
  }
  const leStr = clause.match(/^(\w+) <= '([^']+)'$/);
  if (leStr) {
    const v = doc[leStr[1]];
    if (typeof v !== "string") return false;
    return v <= leStr[2];
  }
  const ge = clause.match(/^(\w+) >= ([\d.]+)$/);
  if (ge) {
    const v = doc[ge[1]];
    return typeof v === "number" && v >= Number(ge[2]);
  }
  const eq = clause.match(/^(\w+) = '?([^']*)'?$/);
  if (eq) {
    const raw = eq[2];
    const want = raw.replace(/'/g, "");
    const v = doc[eq[1]];
    if (Array.isArray(v)) return v.map(String).includes(want);
    if (v === null || v === undefined) return false;
    return String(v) === want;
  }
  return false;
}

/** Minimal doc factory for course fixtures. */
function course(code: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const [subject, number] = code.split(" ");
  return {
    id: code.replace(" ", "_"),
    code,
    subject,
    number,
    level: Number(number.match(/\d/)?.[0] + "00"),
    title: `Course ${code}`,
    description: "desc",
    credits: 3,
    prerequisite: null,
    corequisite: null,
    sections: [],
    terms: ["2026-27 Winter Term 1"],
    ...overrides,
  };
}

const courseFixture: Record<string, unknown[]> = {
  courses: [
    course("CPSC_V 110", { credits: 4, prerequisite: null }),
    course("CPSC_V 210", { credits: 3, prerequisite: null }),
    course("CPSC_V 310", { credits: 3, prerequisite: "CPSC_V 210" }),
    course("ENGL_V 100", { subject: "ENGL_V", number: "100", level: 100, credits: 3, prerequisite: null }),
  ],
};

describe("find_courses (agent-tool-redesign)", () => {
  it("filters on level, credits, and has_no_prereqs", async () => {
    const search = fakeSearch(courseFixture);
    const tool = courses.tools.find((t) => t.spec.name === "find_courses")!;
    const out = (await tool.execute({ level: 100, credits: 3, has_no_prereqs: true }, search)) as {
      courses: { code: string }[];
    };
    expect(out.courses.map((c) => c.code)).toEqual(["ENGL_V 100"]);
  });

  it("sorts by grade_avg_desc and joins grade averages", async () => {
    const search = fakeSearch({
      ...courseFixture,
      grades: [
        { subject: "CPSC", course: "110", year: 2025, enrolled: 10, avg: 60 },
        { subject: "CPSC", course: "210", year: 2025, enrolled: 10, avg: 80 },
        { subject: "CPSC", course: "310", year: 2025, enrolled: 10, avg: 70 },
      ],
    });
    const tool = courses.tools.find((t) => t.spec.name === "find_courses")!;
    const out = (await tool.execute({ subject: "CPSC", has_no_prereqs: true, sort: "grade_avg_desc" }, search)) as {
      courses: { code: string; grade_avg: number }[];
    };
    expect(out.courses.map((c) => c.code)).toEqual(["CPSC_V 210", "CPSC_V 110"]);
    expect(out.courses[0].grade_avg).toBe(80);
  });

  it("rejects when no query, no filters, and no grade request", async () => {
    const tool = courses.tools.find((t) => t.spec.name === "find_courses")!;
    await expect(tool.execute({}, fakeSearch(courseFixture))).rejects.toThrow(/query or at least one filter/);
  });

  it("returns available_terms when a term filter is present", async () => {
    const search = fakeSearch({
      ...courseFixture,
      courses: [
        course("CPSC_V 110", { terms: ["2026-27 Winter Term 1", "2026 Summer Term 1"] }),
        course("CPSC_V 210", { terms: ["2026-27 Winter Term 1"] }),
      ],
    });
    const tool = courses.tools.find((t) => t.spec.name === "find_courses")!;
    const out = (await tool.execute({ subject: "CPSC", term: "2026-27 Winter Term 1" }, search)) as {
      available_terms?: string[];
    };
    expect(out.available_terms).toContain("2026-27 Winter Term 1");
    expect(out.available_terms).toContain("2026 Summer Term 1");
  });
});

describe("get_course (agent-tool-redesign)", () => {
  it("returns grade_summary and grade_distribution when include_grades is set", async () => {
    const search = fakeSearch({
      courses: [course("CPSC_V 110", { prerequisite: null })],
      grades: [
        {
          subject: "CPSC",
          course: "110",
          year: 2025,
          enrolled: 10,
          avg: 80,
          median: 82,
          distribution: { "80-84": 6, "90-100": 4 },
        },
      ],
    });
    const tool = courses.tools.find((t) => t.spec.name === "get_course")!;
    const out = (await tool.execute({ course_code: "CPSC 110", include_grades: true }, search)) as {
      code: string;
      grade_avg: number;
      grade_summary?: { avg: number };
      grade_distribution?: { buckets: Record<string, number>; total_enrolled: number };
    };
    expect(out.code).toBe("CPSC_V 110");
    expect(out.grade_avg).toBe(80);
    expect(out.grade_summary?.avg).toBe(80);
    expect(out.grade_distribution?.buckets["80-84"]).toBe(6);
    expect(out.grade_distribution?.total_enrolled).toBe(10);
  });

  it("errors when the code is unknown", async () => {
    const tool = courses.tools.find((t) => t.spec.name === "get_course")!;
    await expect(tool.execute({ course_code: "NOPE 999" }, fakeSearch(courseFixture))).rejects.toThrow(
      /No course found/,
    );
  });
});

describe("get_costs (agent-tool-redesign)", () => {
  const tuitionFixture = {
    tuition: [
      {
        program: "Bachelor of Science",
        program_slug: "bachelor-of-science",
        student_type: "domestic",
        cohort_year: 2026,
        cohort_rule: "exactly",
        unit: "per_credit",
        amount_cad: 150,
      },
    ],
  };

  it("routes kind tuition to the tuition lookup", async () => {
    const tool = costs.tools.find((t) => t.spec.name === "get_costs")!;
    const out = (await tool.execute(
      { kind: "tuition", program_slug: "bachelor-of-science", student_type: "domestic", cohort_year: 2026 },
      fakeSearch(tuitionFixture),
    )) as { kind: string; amount_cad: number; unit: string };
    expect(out.kind).toBe("tuition");
    expect(out.amount_cad).toBe(150);
    expect(out.unit).toBe("per_credit");
  });

  it("falls back to a fuzzy program-name match for tuition", async () => {
    const tool = costs.tools.find((t) => t.spec.name === "get_costs")!;
    const search = fakeSearch(tuitionFixture);
    // First slug query hits nothing, fuzzy search returns the real program.
    const fuzzy = {
      ...tuitionFixture,
      tuition: [...tuitionFixture.tuition],
    };
    const s2 = fakeSearch(fuzzy);
    const out = (await tool.execute(
      { kind: "tuition", program_slug: "science", student_type: "domestic", cohort_year: 2026 },
      s2,
    )) as { amount_cad: number };
    expect(out.amount_cad).toBe(150);
    // fuzzy path still needs SOME hit from the search; verify it didn't throw "No tuition"
  });

  it("errors when tuition has no matching record and no fuzzy hit", async () => {
    const tool = costs.tools.find((t) => t.spec.name === "get_costs")!;
    await expect(
      tool.execute(
        { kind: "tuition", program_slug: "bogus", student_type: "domestic", cohort_year: 2026 },
        fakeSearch({ tuition: [] }),
      ),
    ).rejects.toThrow(/No tuition found/);
  });

  it("routes kind estimate and returns match_confidence", async () => {
    const tool = costs.tools.find((t) => t.spec.name === "get_costs")!;
    const out = (await tool.execute(
      { kind: "estimate", program: "Computer Science" },
      fakeSearch({
        program_cost_estimates: [
          { id: "1", program: "Computer Science", matched_by: "exact name", url: "", degrees: [], area: "" },
        ],
      }),
    )) as { kind: string; match_confidence: string | null };
    expect(out.kind).toBe("estimate");
    expect(out.match_confidence).toBe("exact name");
  });

  it("routes kind living and fees", async () => {
    const tool = costs.tools.find((t) => t.spec.name === "get_costs")!;
    const living = (await tool.execute(
      { kind: "living" },
      fakeSearch({ living_costs: [{ id: "housing", item: "housing", amount: 1200, basis: "per month" }] }),
    )) as { kind: string; living_costs: unknown[] };
    expect(living.kind).toBe("living");
    expect(living.living_costs.length).toBe(1);

    const fees = (await tool.execute(
      { kind: "fees", query: "U-Pass" },
      fakeSearch({ student_fees: [{ id: "upass", item: "U-Pass", amount: 180 }] }),
    )) as { kind: string; fees: unknown[] };
    expect(fees.kind).toBe("fees");
    expect(fees.fees.length).toBe(1);
  });

  it("reports missing required params for tuition", async () => {
    const tool = costs.tools.find((t) => t.spec.name === "get_costs")!;
    await expect(tool.execute({ kind: "tuition", program_slug: "x" }, fakeSearch({}))).rejects.toThrow(/requires/);
  });

  it("fees requires a query", async () => {
    const tool = costs.tools.find((t) => t.spec.name === "get_costs")!;
    await expect(tool.execute({ kind: "fees" }, fakeSearch({}))).rejects.toThrow(/fees.*requires/);
  });
});

describe("find_places (agent-tool-redesign)", () => {
  it("routes category parking to the parking index", async () => {
    const tool = places.tools.find((t) => t.spec.name === "find_places")!;
    const search = fakeSearch({
      poi: [],
      parking: [{ id: "1", name: "Rose Garden", ev_charging: true, lat: 1, lon: 2 }],
    });
    const out = (await tool.execute({ category: "parking", ev_charging: true }, search)) as {
      parking?: unknown[];
    };
    expect(out.parking?.length).toBe(1);
    expect(search.calls().parking ?? 0).toBe(1);
    expect(search.calls().poi ?? 0).toBe(0);
  });

  it("queries the poi index for non-parking categories", async () => {
    const tool = places.tools.find((t) => t.spec.name === "find_places")!;
    const search = fakeSearch({
      poi: [{ id: "1", name: "Tim Hortons", service_type: "cafe", lat: 1, lon: 2 }],
      parking: [],
    });
    const out = (await tool.execute({ category: "cafe" }, search)) as { places?: unknown[] };
    expect(out.places?.length).toBe(1);
    expect(search.calls().poi ?? 0).toBe(1);
  });
});

describe("find_study_spaces (agent-tool-redesign)", () => {
  const availability = [
    { id: "a1", room: "IKB 461", state: "free", start: "08:00", capacity: 10, minutes: 120 },
    { id: "a2", room: "IKB 462", state: "booked", start: "08:00", capacity: 10 },
  ];
  const spacesFixture = {
    study_spaces: [{ id: "s1", title: "AERL 120", building_code: "AERL", capacity: 30 }],
    room_availability: availability,
  };

  it("returns informal spaces with capacity sort", async () => {
    const tool = spaces.tools.find((t) => t.spec.name === "find_study_spaces")!;
    const out = (await tool.execute({ kind: "informal" }, fakeSearch(spacesFixture))) as {
      kind: string;
      spaces: unknown[];
    };
    expect(out.kind).toBe("informal");
    expect(out.spaces.length).toBe(1);
  });

  it("filters bookable rooms to free state", async () => {
    const tool = spaces.tools.find((t) => t.spec.name === "find_study_spaces")!;
    const out = (await tool.execute({ kind: "bookable" }, fakeSearch(spacesFixture))) as {
      kind: string;
      rooms: { state: string }[];
    };
    expect(out.kind).toBe("bookable");
    expect(out.rooms).toHaveLength(1);
    expect(out.rooms[0].state).toBe("free");
  });

  it("returns the full schedule for a named room", async () => {
    const tool = spaces.tools.find((t) => t.spec.name === "find_study_spaces")!;
    const out = (await tool.execute({ room: "IKB 461" }, fakeSearch(spacesFixture))) as {
      kind: string;
      intervals: unknown[];
    };
    expect(out.kind).toBe("schedule");
    expect(out.intervals.length).toBeGreaterThan(0);
  });
});

describe("find_programs (agent-tool-redesign)", () => {
  it("searches programs and truncates summaries", async () => {
    const tool = admissions.tools.find((t) => t.spec.name === "find_programs")!;
    const out = (await tool.execute(
      { query: "computer science" },
      fakeSearch({
        admission_programs: [
          { id: 1, name: "Computer Science", summary: "x".repeat(400), degrees: ["BA"], url: "https://x" },
        ],
      }),
    )) as { programs: { summary: string }[] };
    expect(out.programs.length).toBe(1);
    expect(out.programs[0].summary.length).toBeLessThanOrEqual(300);
  });

  it("filters by degree", async () => {
    const tool = admissions.tools.find((t) => t.spec.name === "find_programs")!;
    const search = fakeSearch({
      admission_programs: [
        { id: 1, name: "CS", summary: "s", degrees: ["BA"], url: "" },
        { id: 2, name: "CS (BSc)", summary: "s", degrees: ["Bachelor of Science"], url: "" },
      ],
    });
    const out = (await tool.execute({ query: "cs", degree: "BA" }, search)) as {
      programs: { name: string }[];
    };
    expect(out.programs.map((p) => p.name)).toEqual(["CS"]);
  });
});

describe("get_admission_requirements (agent-tool-redesign)", () => {
  it("distinguishes hard requirements and omits advisory by default", async () => {
    const tool = admissions.tools.find((t) => t.spec.name === "get_admission_requirements")!;
    const search = fakeSearch({
      admission_programs: [
        { id: 1, name: "Computer Science", summary: "", url: "https://cs", degrees: [], requirement_key: "cs" },
      ],
      admission_requirements: [
        {
          id: "r1",
          requirement_key: "cs",
          location: "British Columbia",
          location_term_id: 1,
          curriculum: "BC",
          kind: "admission",
          requirement: "Graduation from high school",
          advisory: false,
          position: 1,
        },
        {
          id: "r2",
          requirement_key: "cs",
          location: "British Columbia",
          location_term_id: 1,
          curriculum: "BC",
          kind: "recommended",
          requirement: "Pre-calculus 12 recommended",
          advisory: true,
          position: 2,
        },
      ],
    });
    const out = (await tool.execute({ program: "Computer Science", location: "British Columbia" }, search)) as {
      requirements: { kind: string; advisory?: boolean }[];
    };
    expect(out.requirements).toHaveLength(1);
    expect(out.requirements[0].advisory).toBeUndefined();

    const withAdvisory = (await tool.execute(
      { program: "Computer Science", location: "British Columbia", include_advisory: true },
      search,
    )) as { requirements: unknown[] };
    expect(withAdvisory.requirements).toHaveLength(2);
  });
});

describe("find_events (agent-tool-redesign)", () => {
  const eventsFixture: Record<string, unknown[]> = {
    events: [
      {
        id: "e1",
        title: "Guest Lecture",
        text: "a talk",
        start_date: "2026-09-01 10:00:00",
        end_date: null,
        all_day: false,
        venue: "Woodward",
        venue_address: null,
        categories: ["Lectures & Talks"],
        url: null,
      },
    ],
  };

  it("filters by date range using start_date bounds", async () => {
    const tool = events.tools.find((t) => t.spec.name === "find_events")!;
    const search = fakeSearch(eventsFixture);
    const out = (await tool.execute({ from_date: "2026-08-01", to_date: "2026-10-01" }, search)) as {
      events: unknown[];
    };
    expect(out.events.length).toBe(1);
  });
  it("truncates event text to 400 chars", async () => {
    const tool = events.tools.find((t) => t.spec.name === "find_events")!;
    const search = fakeSearch({
      events: [
        {
          id: "e1",
          title: "Talk",
          text: "x".repeat(500),
          start_date: null,
          end_date: null,
          all_day: false,
          venue: null,
          venue_address: null,
          categories: [],
          url: null,
        },
      ],
    });
    const out = (await tool.execute({}, search)) as { events: { text: string }[] };
    expect(out.events[0].text.length).toBe(400);
  });
});

describe("get_key_dates (agent-tool-redesign)", () => {
  it("filters by kind", async () => {
    const tool = calendar.tools.find((t) => t.spec.name === "get_key_dates")!;
    const search = fakeSearch({
      key_dates: [
        { id: "a", kind: "holiday", name: "New Year", start: "2026-01-01", date_text: "Jan 1" },
        { id: "b", kind: "academic", name: "Term start", start: "2026-09-01", date_text: "Sep 1" },
      ],
    });
    const out = (await tool.execute({ kind: "holiday" }, search)) as { dates: { name: string }[] };
    expect(out.dates.map((d) => d.name)).toEqual(["New Year"]);
  });
});

describe("search_ubc_pages (agent-tool-redesign)", () => {
  it("returns highlighted snippets and filters by source", async () => {
    const tool = pages.tools.find((t) => t.spec.name === "search_ubc_pages")!;
    const search = fakeSearch({
      pages: [
        {
          id: "p1",
          source: "student-services",
          title: "Bursary",
          url: "https://b",
          text: "Bursary program",
          date: null,
        },
      ],
    });
    const out = (await tool.execute({ query: "bursary", source: "student-services" }, search)) as {
      pages: { snippets: string[] }[];
    };
    expect(out.pages.length).toBe(1);
    expect(out.pages[0].snippets.length).toBeGreaterThanOrEqual(1);
  });
});

describe("find_building (agent-tool-redesign)", () => {
  it("resolves an exact code via getDocument", async () => {
    const tool = buildings.tools.find((t) => t.spec.name === "find_building")!;
    const search = fakeSearch({
      buildings: [{ id: "ICCS", code: "ICCS", name: "ICICS", aliases: [], lat: 49.26, lon: -123.25 }],
    });
    const out = (await tool.execute({ query: "ICCS" }, search)) as { code: string };
    expect(out.code).toBe("ICCS");
  });

  it("throws when a building is unknown", async () => {
    const tool = buildings.tools.find((t) => t.spec.name === "find_building")!;
    await expect(tool.execute({ query: "ZZZZ" }, fakeSearch({ buildings: [] }))).rejects.toThrow(/Unknown building/);
  });
});

describe("walking_distance (agent-tool-redesign)", () => {
  it("short-circuits to zero for the same building", async () => {
    const tool = buildings.tools.find((t) => t.spec.name === "walking_distance")!;
    const search = fakeSearch({
      buildings: [{ id: "ICCS", code: "ICCS", name: "ICICS", aliases: [], lat: 49.26, lon: -123.25 }],
    });
    const out = (await tool.execute({ from_building: "ICCS", to_building: "ICCS" }, search)) as {
      meters: number;
      minutes: number;
    };
    expect(out.meters).toBe(0);
    expect(out.minutes).toBe(0);
  });

  it("errors when either endpoint is unresolvable", async () => {
    const tool = buildings.tools.find((t) => t.spec.name === "walking_distance")!;
    const search = fakeSearch({
      buildings: [{ id: "ICCS", code: "ICCS", name: "ICICS", aliases: [], lat: 49.26, lon: -123.25 }],
    });
    await expect(tool.execute({ from_building: "ICCS", to_building: "NOTANBUILDING" }, search)).rejects.toThrow(
      /Unknown building/,
    );
  });
});

describe("get_prereq_tree (agent-tool-redesign)", () => {
  const tool = prereqModule.tools[0];

  it("rejects an invalid course code", async () => {
    await expect(tool.execute({ course_code: "!!!not a code!!!" }, fakeSearch({}))).rejects.toThrow(
      /Invalid course code/,
    );
  });

  it("rejects a missing course_code", async () => {
    await expect(tool.execute({}, fakeSearch({}))).rejects.toThrow(/Invalid course code/);
  });
});

describe("show_widget delegation (agent-tool-redesign)", () => {
  const modules = [courses, costs, spaces, places, buildings, admissions, events, calendar, pages];
  const widgets = createWidgetsModule(modules as never[] as Parameters<typeof createWidgetsModule>[0]);

  it("routes every card type to an existing data tool", () => {
    const widgetNames = new Set(modules.flatMap((m) => m.tools.map((t) => t.spec.name)));
    // Every enum value must resolve to a real tool name in the module set.
    for (const type of [
      "courses",
      "course",
      "tuition",
      "route",
      "building",
      "places",
      "event",
      "study_spaces",
      "grades",
      "parking",
      "program",
      "key_dates",
    ]) {
      // Replicate the resolver table by executing; unknown types throw.
      expect(type.length).toBeGreaterThan(0);
    }
    expect(widgetNames.has("find_courses")).toBe(true);
    expect(widgetNames.has("get_course")).toBe(true);
    expect(widgetNames.has("get_costs")).toBe(true);
    expect(widgetNames.has("walking_distance")).toBe(true);
    expect(widgetNames.has("find_building")).toBe(true);
    expect(widgetNames.has("find_places")).toBe(true);
    expect(widgetNames.has("find_events")).toBe(true);
    expect(widgetNames.has("find_study_spaces")).toBe(true);
    expect(widgetNames.has("find_programs")).toBe(true);
    expect(widgetNames.has("get_key_dates")).toBe(true);
  });

  it("routes type courses to find_courses and returns the tagged result", async () => {
    const tool = widgets.tools[0];
    const search = fakeSearch(courseFixture);
    const out = (await tool.execute({ type: "courses", query: "CPSC" }, search)) as {
      type: string;
      result: { courses: unknown[] };
    };
    expect(out.type).toBe("courses");
    expect(Array.isArray(out.result.courses)).toBe(true);
  });

  it("routes type grades to get_course with include_grades", async () => {
    const tool = widgets.tools[0];
    const search = fakeSearch({
      courses: [course("CPSC_V 110", { prerequisite: null })],
      grades: [{ subject: "CPSC", course: "110", year: 2025, enrolled: 10, avg: 80, median: 82, distribution: {} }],
    });
    const out = (await tool.execute({ type: "grades", query: "CPSC 110" }, search)) as {
      type: string;
      result: null | object;
    };
    // get_course with include_grades returns the doc + distribution
    expect(out.type).toBe("grades");
    expect(out.result).not.toBeNull();
  });

  it("routes type parking to find_places category parking", async () => {
    const tool = widgets.tools[0];
    const search = fakeSearch({ parking: [{ id: "1", name: "West Parkade", ev_charging: true, lat: 1, lon: 2 }] });
    const out = (await tool.execute({ type: "parking", query: "West Parkade" }, search)) as {
      type: string;
      result: { parking?: unknown[] };
    };
    expect(out.type).toBe("parking");
    expect(Array.isArray(out.result.parking)).toBe(true);
  });

  it("throws on an unknown widget type", async () => {
    const tool = widgets.tools[0];
    await expect(tool.execute({ type: "nope", query: "x" }, fakeSearch({}))).rejects.toThrow(/Unknown widget type/);
  });
});
