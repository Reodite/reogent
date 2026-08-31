// @vitest-environment happy-dom
import type { CourseDoc } from "@/src/lib/api-types";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SchedulePlannerPane } from "./schedule-planner-pane";

const term = "2026-27 Winter Term 1";

const courses: Record<string, CourseDoc> = {
  "CPSC 110": {
    code: "CPSC 110",
    subject: "CPSC",
    number: "110",
    title: "Computation, Programs, and Programming",
    description: "",
    credits: 4,
    prerequisite: null,
    corequisite: null,
    terms: [term],
    sections: [
      {
        section: "101",
        term,
        days: ["Mon", "Wed", "Fri"],
        start_time: "09:00",
        end_time: "10:00",
      },
      {
        section: "102",
        term,
        days: ["Tue", "Thu"],
        start_time: "11:00",
        end_time: "12:00",
      },
      {
        section: "L1A",
        term,
        days: ["Thu"],
        start_time: "14:00",
        end_time: "15:00",
      },
    ],
  },
  "MATH 100": {
    code: "MATH 100",
    subject: "MATH",
    number: "100",
    title: "Differential Calculus",
    description: "",
    credits: 3,
    prerequisite: null,
    corequisite: null,
    terms: [term],
    sections: [
      {
        section: "201",
        term,
        days: ["Mon", "Wed", "Fri"],
        start_time: "09:30",
        end_time: "10:30",
      },
    ],
  },
};

const scheduleMock = vi.hoisted(() => ({
  state: {
    entries: [
      {
        code: "CPSC 110",
        section: "101",
        term: "2026-27 Winter Term 1",
        snapshot: {
          title: "Computation, Programs, and Programming",
          instructor: null,
          days: ["Mon", "Wed", "Fri"],
          start_time: "09:00",
          end_time: "10:00",
          status: null,
        },
      },
      {
        code: "MATH 100",
        section: "201",
        term: "2026-27 Winter Term 1",
        snapshot: {
          title: "Differential Calculus",
          instructor: null,
          days: ["Mon", "Wed", "Fri"],
          start_time: "09:30",
          end_time: "10:30",
          status: null,
        },
      },
    ],
    activeTerm: "2026-27 Winter Term 1",
    stale: false,
    addEntry: vi.fn(),
    removeEntry: vi.fn(),
    removeCourse: vi.fn(),
    setActiveTerm: vi.fn(),
    setStale: vi.fn(),
  },
}));

vi.mock("./schedule-store", () => ({
  normalizeScheduleCode: (code: string) => code.replace("_V", "").replace(/\s+/g, " ").trim().toUpperCase(),
  entryId: (entry: { code: string; section: string; term: string }) =>
    `${entry.code}::${entry.section}::${entry.term}`,
  useSchedule: (selector: (state: typeof scheduleMock.state) => unknown) => selector(scheduleMock.state),
}));

vi.mock("./use-schedule-sync", () => ({ useScheduleSync: () => undefined }));
vi.mock("@/src/components/course-lookup/course-search", () => ({
  CourseSearchField: () => <input aria-label="Find a course to schedule" />,
  useCourseAutocomplete: () => ({
    list: null,
    status: "idle",
    error: null,
    rejected: false,
    record: null,
    lookup: vi.fn(),
  }),
}));
vi.mock("@/src/components/providers", () => ({
  useApi: () => ({
    getCourse: async (code: string) => courses[code],
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SchedulePlannerPane", () => {
  it("renders selected sections, component pickers, and conflicts", async () => {
    const view = render(<SchedulePlannerPane />);

    await waitFor(() => {
      expect(view.getAllByText("CPSC 110").length).toBeGreaterThan(0);
      expect(view.getAllByText("MATH 100").length).toBeGreaterThan(0);
    });

    expect(view.getAllByText("Lecture").length).toBe(2);
    expect(view.getByText("Laboratory")).toBeTruthy();
    expect(view.getByText("2 conflicting sections")).toBeTruthy();
    expect(view.getByText("· 7 credits")).toBeTruthy();
    expect(view.getAllByText("Mon").length).toBeGreaterThan(0);

    fireEvent.change(view.getAllByRole("combobox", { name: "Lecture" })[0], { target: { value: "102" } });
    expect(scheduleMock.state.addEntry).toHaveBeenCalledWith(courses["CPSC 110"], courses["CPSC 110"].sections[1]);
  });
});
