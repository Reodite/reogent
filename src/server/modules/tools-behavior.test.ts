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
          const offset = Number(opts?.offset ?? 0);
          const sliced = hits.slice(offset, offset + (Number.isFinite(limit) ? limit : hits.length));
          const base = { estimatedTotalHits: hits.length };
          if ((opts?.attributesToHighlight as string[] | undefined)?.includes("text")) {
            return {
              ...base,
              hits: sliced.map((h) => ({
                ...(h as object),
                _formatted: { text: `...${String((h as Record<string, unknown>).text ?? "")}...` },
              })),
            };
          }
          return { ...base, hits: sliced };
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

  it("ranks a high-average course far down code order (regression: pool truncation)", async () => {
    // 210 candidates; the highest-average course is alphabetically LAST, so a
    // code-ordered candidate pool truncated at 200 would silently drop it.
    const coursesList: Record<string, unknown>[] = [];
    const grades: Record<string, unknown>[] = [];
    for (let i = 0; i < 210; i++) {
      const number = String(100 + i);
      coursesList.push(course(`CPSC_V ${number}`));
      grades.push({ subject: "CPSC", course: number, year: 2025, enrolled: 10, avg: 50 });
    }
    // Alphabetically last code wins the ranking.
    const number = "999";
    coursesList.push(course(`CPSC_V ${number}`));
    grades.push({ subject: "CPSC", course: number, year: 2025, enrolled: 10, avg: 99 });
    const search = fakeSearch({ courses: coursesList, grades });
    const tool = courses.tools.find((t) => t.spec.name === "find_courses")!;
    const out = (await tool.execute({ sort: "grade_avg_desc", limit: 5 }, search)) as {
      courses: { code: string; grade_avg: number }[];
    };
    expect(out.courses[0].code).toBe("CPSC_V 999");
    expect(out.courses[0].grade_avg).toBe(99);
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

  it("returns found:false when tuition has no matching record and no fuzzy hit", async () => {
    const tool = costs.tools.find((t) => t.spec.name === "get_costs")!;
    const out = (await tool.execute(
      { kind: "tuition", program_slug: "bogus", student_type: "domestic", cohort_year: 2026 },
      fakeSearch({ tuition: [] }),
    )) as { kind: string; found: boolean; requested_program_slug: string };
    expect(out.kind).toBe("tuition");
    expect(out.found).toBe(false);
    expect(out.requested_program_slug).toBe("bogus");
  });

  it("falls back to the closest program when tuition has no exact match", async () => {
    const tool = costs.tools.find((t) => t.spec.name === "get_costs")!;
    const out = (await tool.execute(
      { kind: "tuition", program_slug: "computer-science", student_type: "domestic", cohort_year: 2026 },
      fakeSearch({
        tuition: [
          {
            program: "Science",
            program_slug: "science",
            student_type: "domestic",
            cohort_year: 2026,
            cohort_rule: "exactly",
            unit: "per_credit",
            amount_cad: 150,
          },
        ],
      }),
    )) as { kind: string; program: string; amount_cad: number };
    expect(out.kind).toBe("tuition");
    expect(out.program).toBe("Science");
    expect(out.amount_cad).toBe(150);
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

describe("show_widget (explicit entities)", () => {
  const widgets = createWidgetsModule();
  const tool = widgets.tools[0];

  it("renders courses by course code", async () => {
    const search = fakeSearch({ courses: [course("MATH_V 101")] });
    const out = (await tool.execute({ type: "courses", course_codes: ["MATH 101"] }, search)) as {
      type: string;
      result: { courses: { code: string }[] };
    };
    expect(out.type).toBe("courses");
    expect(out.result.courses.map((c) => c.code)).toEqual(["MATH_V 101"]);
  });

  it("skips course codes that do not resolve", async () => {
    const search = fakeSearch({ courses: [course("MATH_V 101")] });
    const out = (await tool.execute({ type: "courses", course_codes: ["MATH 101", "NOPE 999"] }, search)) as {
      result: { courses: unknown[] };
    };
    expect(out.result.courses).toHaveLength(1);
  });

  it("accepts an event id exactly as find_events returns it (sanitized)", async () => {
    const search = fakeSearch({
      events: [{ id: "events_ubc_ca_id_38483", title: "Talk", text: "x" }],
    });
    const out = (await tool.execute({ type: "event", event_ids: ["events_ubc_ca_id_38483"] }, search)) as {
      result: { events: unknown[] };
    };
    expect(out.result.events).toHaveLength(1);
  });

  it("requires course_codes for the courses type", async () => {
    await expect(tool.execute({ type: "courses" }, fakeSearch(courseFixture))).rejects.toThrow(/requires course_codes/);
  });

  it("renders one course by code", async () => {
    const search = fakeSearch({ courses: [course("CPSC_V 110")] });
    const out = (await tool.execute({ type: "course", course: "CPSC 110" }, search)) as {
      result: { code: string };
    };
    expect(out.result.code).toBe("CPSC_V 110");
  });

  it("prefers the most recent session record for grades and labels it", async () => {
    const search = fakeSearch({
      courses: [course("CPSC_V 110")],
      course_sessions: [
        {
          id: "CPSC_110__2025W",
          average: 83.9,
          weightedMedian: 86.1,
          reported: 234,
          buckets: { "80-84": 38, "85-89": 69, "90-100": 73 },
        },
      ],
      grades: [
        {
          subject: "CPSC",
          course: "110",
          year: 2019,
          enrolled: 100,
          avg: 70,
          median: 71,
          distribution: { "70-75": 100 },
        },
      ],
    });
    const out = (await tool.execute({ type: "grades", course: "CPSC 110" }, search)) as {
      result: { session?: string; average?: number; reported?: number; pooled?: boolean; note?: string };
    };
    expect(out.result.session).toBe("2025W");
    expect(out.result.average).toBe(83.9);
    expect(out.result.reported).toBe(234);
    expect(out.result.pooled).toBeUndefined();
  });

  it("falls back to pooled grades with an explicit scope note when no session record exists", async () => {
    const search = fakeSearch({
      courses: [course("CPSC_V 110")],
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
    const out = (await tool.execute({ type: "grades", course: "CPSC 110" }, search)) as {
      result: {
        session?: string;
        pooled?: boolean;
        note?: string;
        grade_summary?: { earliest_year?: number; latest_year?: number };
      };
    };
    expect(out.result.session).toBeUndefined();
    expect(out.result.pooled).toBe(true);
    expect(out.result.note).toMatch(/pooled across 1 section/i);
    expect(out.result.grade_summary?.earliest_year).toBe(2025);
    expect(out.result.grade_summary?.latest_year).toBe(2025);
  });

  it("errors when no grade records exist at all", async () => {
    const search = fakeSearch({ courses: [course("CPSC_V 110")] });
    await expect(tool.execute({ type: "grades", course: "CPSC 110" }, search)).rejects.toThrow(
      /No grade records found/,
    );
  });

  it("renders buildings by code", async () => {
    const search = fakeSearch({
      buildings: [{ id: "ICCS", code: "ICCS", name: "ICICS", aliases: [], lat: 1, lon: 2 }],
    });
    const out = (await tool.execute({ type: "building", buildings: ["ICCS"] }, search)) as {
      result: { code: string };
    };
    expect(out.result.code).toBe("ICCS");
  });

  it("renders a route for an explicit pair", async () => {
    const search = fakeSearch({
      buildings: [
        { id: "ICCS", code: "ICCS", name: "ICICS", aliases: [], lat: 1, lon: 2 },
        { id: "IKB", code: "IKB", name: "IKBLC", aliases: [], lat: 2, lon: 3 },
      ],
    });
    // Same-building short-circuits to zero without touching the route graph.
    const out = (await tool.execute({ type: "route", from_building: "ICCS", to_building: "ICCS" }, search)) as {
      result: { meters: number };
    };
    expect(out.result.meters).toBe(0);
  });

  it("renders places and parking by id", async () => {
    const search = fakeSearch({
      poi: [{ id: "VPOI10040", name: "Great Dane", lat: 1, lon: 2 }],
      parking: [{ id: "2126", name: "Agronomy Road", lat: 1, lon: 2 }],
    });
    const placesOut = (await tool.execute(
      { type: "places", place_ids: ["VPOI10040"], near_building: "NEST" },
      search,
    )) as { result: { places: unknown[]; near_building?: string } };
    expect(placesOut.result.places).toHaveLength(1);
    expect(placesOut.result.near_building).toBe("NEST");

    const parkingOut = (await tool.execute({ type: "parking", parking_ids: ["2126"] }, search)) as {
      result: { parking: unknown[] };
    };
    expect(parkingOut.result.parking).toHaveLength(1);
  });

  it("renders events by numeric id", async () => {
    const search = fakeSearch({
      events: [{ id: "events_ubc_ca_id_38481", title: "Guest Lecture", text: "x".repeat(500) }],
    });
    const out = (await tool.execute({ type: "event", event_ids: ["38481"] }, search)) as {
      result: { events: { text: string }[] };
    };
    expect(out.result.events).toHaveLength(1);
    // text truncated to 400
    expect(out.result.events[0].text.length).toBe(400);
  });

  it("renders study spaces by id and rooms by eid", async () => {
    const search = fakeSearch({
      study_spaces: [{ id: "s1", title: "AERL 120", building_code: "AERL", capacity: 30 }],
      lib_rooms: [{ id: "461", eid: "461", title: "IKB 461", capacity: 10 }],
    });
    const spacesOut = (await tool.execute({ type: "study_spaces", study_space_ids: ["s1"] }, search)) as {
      result: { kind: string; spaces: unknown[] };
    };
    expect(spacesOut.result.kind).toBe("informal");
    expect(spacesOut.result.spaces).toHaveLength(1);

    const roomsOut = (await tool.execute({ type: "study_spaces", room_eids: ["461"] }, search)) as {
      result: { kind: string; rooms: unknown[] };
    };
    expect(roomsOut.result.kind).toBe("bookable");
    expect(roomsOut.result.rooms).toHaveLength(1);
  });

  it("renders programs and key dates by id", async () => {
    const search = fakeSearch({
      admission_programs: [{ id: 621, name: "Computer Science", summary: "s", degrees: [], url: "" }],
      key_dates: [{ id: "holiday_new-year-s-day_2026-01-01", kind: "holiday", name: "New Year", start: "2026-01-01" }],
    });
    const programsOut = (await tool.execute({ type: "program", program_ids: [621] }, search)) as {
      result: { programs: unknown[] };
    };
    expect(programsOut.result.programs).toHaveLength(1);

    const datesOut = (await tool.execute(
      { type: "key_dates", key_date_ids: ["holiday_new-year-s-day_2026-01-01"] },
      search,
    )) as { result: { dates: unknown[] } };
    expect(datesOut.result.dates).toHaveLength(1);
  });

  it("renders tuition only with explicit context params", async () => {
    const search = fakeSearch({
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
    });
    const out = (await tool.execute(
      { type: "tuition", program_slug: "bachelor-of-science", student_type: "domestic", cohort_year: 2026 },
      search,
    )) as { type: string; result: { amount_cad: number } };
    expect(out.type).toBe("tuition");
    expect(out.result.amount_cad).toBe(150);
  });

  it("throws when required entity fields are missing", async () => {
    await expect(tool.execute({ type: "places" }, fakeSearch({}))).rejects.toThrow(/requires place_ids/);
    await expect(tool.execute({ type: "event" }, fakeSearch({}))).rejects.toThrow(/requires event_ids/);
    await expect(tool.execute({ type: "route" }, fakeSearch({}))).rejects.toThrow(/requires from_building/);
  });

  it("throws on an unknown widget type", async () => {
    await expect(tool.execute({ type: "nope", query: "x" }, fakeSearch({}))).rejects.toThrow(/Unknown widget type/);
  });
});
