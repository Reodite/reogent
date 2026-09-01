import { describe, expect, it, vi } from "vitest";
import type { CourseDoc, CourseSection } from "./api-types";
import { resolvePlannerImport } from "./schedule-planner-import";
import type { Schedule, Section } from "./schedule/types";

function source(overrides: Partial<Section> = {}): Section {
  return {
    id: "workday-1",
    courseCode: "CPSC_V 210",
    title: "Software Construction",
    component: "Lecture",
    instructors: ["Ada Lovelace"],
    termStart: "2026-09-08",
    termEnd: "2026-12-07",
    meetings: [{ days: ["Mon", "Wed", "Fri"], startMin: 840, endMin: 900, raw: "" }],
    ...overrides,
  };
}

function catalogSection(section: string, overrides: Partial<CourseSection> = {}): CourseSection {
  return {
    section,
    term: "2026-27 Winter Term 1 (UBC-V)",
    days: ["m", "w", "f"],
    start_time: "14:00",
    end_time: "15:00",
    status: "Open",
    ...overrides,
  };
}

function doc(sections: CourseSection[]): CourseDoc {
  return {
    code: "CPSC 210",
    subject: "CPSC",
    number: "210",
    title: "Software Construction",
    description: "",
    credits: 4,
    prerequisite: null,
    corequisite: null,
    terms: ["2026-27 Winter Term 1 (UBC-V)"],
    sections,
  };
}

function schedule(sections: Section[]): Schedule {
  return { sections, sourceFileName: "workday.xlsx", importedAt: "2026-09-01T00:00:00.000Z" };
}

describe("resolvePlannerImport", () => {
  it("finds the exact editable section across Workday and catalog formats", async () => {
    const course = doc([catalogSection("102")]);
    const review = await resolvePlannerImport(
      schedule([source()]),
      vi.fn(async () => course),
    );

    expect(review.sourceFileName).toBe("workday.xlsx");
    expect(review.matches[0]).toMatchObject({ status: "exact", doc: course, candidates: [course.sections[0]] });
  });

  it("stages duplicate schedule matches for explicit review", async () => {
    const course = doc([catalogSection("102"), catalogSection("103")]);
    const review = await resolvePlannerImport(
      schedule([source()]),
      vi.fn(async () => course),
    );

    expect(review.matches[0]).toMatchObject({ status: "ambiguous", candidates: course.sections });
  });

  it("does not invent identifiers for TBA or multi-pattern sections", async () => {
    const course = doc([catalogSection("102")]);
    const review = await resolvePlannerImport(
      schedule([
        source({ id: "tba", meetings: [] }),
        source({
          id: "split",
          meetings: [
            { days: ["Mon"], startMin: 840, endMin: 900, raw: "" },
            { days: ["Fri"], startMin: 900, endMin: 960, raw: "" },
          ],
        }),
      ]),
      vi.fn(async () => course),
    );

    expect(review.matches.map((match) => match.status)).toEqual(["unmatched", "unmatched"]);
    expect(review.matches.map((match) => match.reason)).toEqual([
      "Workday lists no meeting time.",
      "The catalog cannot represent this section’s multiple meeting patterns.",
    ]);
  });

  it("matches unknown Workday component types to catalog additional groups", async () => {
    const workshop = source({
      component: "Workshop",
      meetings: [{ days: ["Tue"], startMin: 900, endMin: 960, raw: "" }],
    });
    const course = doc([catalogSection("W-L", { days: ["t"], start_time: "15:00", end_time: "16:00" })]);
    const review = await resolvePlannerImport(
      schedule([workshop]),
      vi.fn(async () => course),
    );

    expect(review.matches[0]).toMatchObject({ status: "exact", candidates: [course.sections[0]] });
  });

  it("keeps a missing catalog course as an unmatched review row", async () => {
    const review = await resolvePlannerImport(
      schedule([source()]),
      vi.fn(async () => Promise.reject(new Error("down"))),
    );
    expect(review.matches[0]).toMatchObject({
      status: "unmatched",
      reason: "Course not found in the catalog.",
    });
  });
});
