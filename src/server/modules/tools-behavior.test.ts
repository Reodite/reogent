import { describe, expect, it } from "vitest";
import type { SearchClient } from "../core/types";
import { costs } from "./costs";
import { courses } from "./courses";
import { places } from "./places";
import { spaces } from "./spaces";

/** A SearchClient whose index returns canned hits per index name, honoring
 *  simple equality filters (`state`, `subject`, `course`) so course-prime joins
 *  and bookable-mode selection are observable. */
function fakeSearch(data: Record<string, unknown[]>): SearchClient {
  return {
    index: (name: string) => ({
      search: async (_q: string, opts?: { filter?: string }) => {
        const filter = opts?.filter ?? "";
        let hits = data[name] ?? [];
        for (const key of ["state", "subject", "course"]) {
          const m = filter.match(new RegExp(`${key} = '([^']+)'`));
          if (m) {
            const want = m[1];
            hits = hits.filter((h) => (h as Record<string, unknown>)[key] === want);
          }
        }
        return { hits };
      },
    }),
  } as unknown as SearchClient;
}

const courseDoc = {
  code: "CPSC_V 110",
  subject: "CPSC_V",
  number: "110",
  level: 100,
  title: "Computation",
  description: "intro",
  credits: 4,
  prerequisite: null,
  corequisite: null,
  sections: [],
  terms: [],
};

describe("find_courses grade join (agent-tool-redesign)", () => {
  it("sorts grade_avg_desc by pooled average and returns grade_avg", async () => {
    const search = fakeSearch({
      courses: [
        { ...courseDoc, code: "CPSC_V 110" },
        { ...courseDoc, code: "CPSC_V 210", subject: "CPSC_V", number: "210", title: "Algo" },
      ],
      grades: [
        { subject: "CPSC", course: "110", year: 2024, enrolled: 10, avg: 80, distribution: {} },
        { subject: "CPSC", course: "210", year: 2024, enrolled: 10, avg: 60, distribution: {} },
      ],
    });
    const tool = courses.tools.find((t) => t.spec.name === "find_courses");
    const out = (await tool?.execute({ sort: "grade_avg_desc" }, search)) as {
      courses: { code: string; grade_avg: number }[];
    };
    expect(out.courses[0].code).toBe("CPSC_V 110");
    expect(out.courses[0].grade_avg).toBe(80);
    expect(out.courses[1].code).toBe("CPSC_V 210");
  });

  it("rejects when no query and no filters are given", async () => {
    const tool = courses.tools.find((t) => t.spec.name === "find_courses");
    await expect(tool?.execute({}, fakeSearch({ courses: [courseDoc] }))).rejects.toThrow(
      /query or at least one filter/,
    );
  });
});

describe("get_course include_grades (agent-tool-redesign)", () => {
  it("returns grade_summary and grade_distribution when include_grades is set", async () => {
    const search = fakeSearch({
      courses: [{ ...courseDoc, code: "CPSC_V 110" }],
      grades: [
        { subject: "CPSC", course: "110", year: 2024, enrolled: 10, avg: 80, median: 82, distribution: { "80-84": 6 } },
      ],
    });
    const tool = courses.tools.find((t) => t.spec.name === "get_course");
    // findByCode uses filter `code = '...'`; our fake search ignores filters and returns all.
    const out = (await tool?.execute({ course_code: "CPSC 110", include_grades: true }, search)) as {
      code: string;
      grade_avg: number;
      grade_summary?: { avg: number };
      grade_distribution?: { buckets: Record<string, number> };
    };
    expect(out.code).toBe("CPSC_V 110");
    expect(out.grade_avg).toBe(80);
    expect(out.grade_summary?.avg).toBe(80);
    expect(out.grade_distribution?.buckets["80-84"]).toBe(6);
  });
});

describe("get_costs dispatch (agent-tool-redesign)", () => {
  it("routes kind tuition to the tuition lookup", async () => {
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
    const tool = costs.tools.find((t) => t.spec.name === "get_costs");
    const out = (await tool?.execute(
      { kind: "tuition", program_slug: "bachelor-of-science", student_type: "domestic", cohort_year: 2026 },
      search,
    )) as { kind: string; unit: string; amount_cad: number };
    expect(out.kind).toBe("tuition");
    expect(out.amount_cad).toBe(150);
  });

  it("reports missing required params for tuition", async () => {
    const tool = costs.tools.find((t) => t.spec.name === "get_costs");
    await expect(tool?.execute({ kind: "tuition", program_slug: "x" }, fakeSearch({}))).rejects.toThrow(/requires/);
  });
});

describe("find_places parking routing (agent-tool-redesign)", () => {
  it("queries the parking index and returns under the parking key", async () => {
    const search = fakeSearch({
      parking: [{ id: "1", name: "Rose Garden", ev_charging: true, lat: 1, lon: 2 }],
      poi: [],
    });
    const tool = places.tools.find((t) => t.spec.name === "find_places");
    const out = (await tool?.execute({ category: "parking" }, search)) as { parking?: unknown[] };
    expect(Array.isArray(out.parking)).toBe(true);
    expect(out.parking?.length).toBe(1);
  });

  it("queries the poi index for non-parking categories", async () => {
    const search = fakeSearch({
      po: [],
      poi: [{ id: "1", name: "Tim Hortons", service_type: "cafe", lat: 1, lon: 2 }],
    });
    const tool = places.tools.find((t) => t.spec.name === "find_places");
    const out = (await tool?.execute({ category: "cafe" }, search)) as { places?: unknown[] };
    expect(Array.isArray(out.places)).toBe(true);
    expect(out.places?.length).toBe(1);
  });
});

describe("find_study_spaces mode selection (agent-tool-redesign)", () => {
  it("returns schedule mode when a room is given", async () => {
    const search = fakeSearch({
      room_availability: [
        {
          room: "IKB 461",
          location: "IKB",
          state: "free",
          date: "2026-08-06",
          start: "08:00",
          end: "10:00",
          minutes: 120,
        },
      ],
    });
    const tool = spaces.tools.find((t) => t.spec.name === "find_study_spaces");
    const out = (await tool?.execute({ room: "IKB 461" }, search)) as { kind: string; intervals?: unknown[] };
    expect(out.kind).toBe("schedule");
    expect(out.intervals?.length).toBe(1);
  });

  it("returns bookable mode filtered to free rooms", async () => {
    const search = fakeSearch({
      room_availability: [
        { room: "IKB 461", state: "free", start: "08:00", capacity: 10 },
        { room: "IKB 462", state: "booked", start: "08:00", capacity: 10 },
      ],
    });
    const tool = spaces.tools.find((t) => t.spec.name === "find_study_spaces");
    const out = (await tool?.execute({ kind: "bookable" }, search)) as { kind: string; rooms: { state: string }[] };
    expect(out.kind).toBe("bookable");
    expect(out.rooms.every((r) => r.state === "free")).toBe(true);
  });
});
