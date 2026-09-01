// @vitest-environment happy-dom
import type { CourseDoc } from "@/src/lib/api-types";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plannerDragOptions, plannerGridItems, SchedulePlannerPane } from "./schedule-planner-pane";

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

const initialEntries = [
  {
    code: "CPSC 110",
    section: "101",
    term,
    snapshot: {
      title: "Computation, Programs, and Programming",
      instructor: null,
      days: ["m", "Wed", "Fri"],
      start_time: "09:00",
      end_time: "10:00",
      status: null,
    },
  },
  {
    code: "MATH 100",
    section: "201",
    term,
    snapshot: {
      title: "Differential Calculus",
      instructor: null,
      days: ["Mon", "Wed", "Fri"],
      start_time: "09:30",
      end_time: "10:30",
      status: null,
    },
  },
];

const scheduleMock = vi.hoisted(() => ({
  state: {
    entries: [] as typeof initialEntries,
    activeTerm: "2026-27 Winter Term 1",
    stale: false,
    addEntry: vi.fn(),
    addCourseSections: vi.fn(),
    removeEntry: vi.fn(),
    removeCourse: vi.fn(),
    setActiveTerm: vi.fn(),
    setStale: vi.fn(),
  },
}));

vi.mock("./schedule-store", () => ({
  normalizeScheduleCode: (code: string) => code.replace("_V", "").replace(/\s+/g, " ").trim().toUpperCase(),
  entryId: (entry: { code: string; section: string; term: string }) => `${entry.code}::${entry.section}::${entry.term}`,
  useSchedule: (selector: (state: typeof scheduleMock.state) => unknown) => selector(scheduleMock.state),
}));

vi.mock("./use-schedule-sync", () => ({ useScheduleSync: () => undefined }));
const autocompleteMock = vi.hoisted(() => ({ record: null as CourseDoc | null }));
vi.mock("@/src/components/course-lookup/course-search", () => ({
  CourseSearchField: () => <input aria-label="Find a course to schedule" />,
  useCourseAutocomplete: () => ({
    list: null,
    status: "idle",
    error: null,
    rejected: false,
    record: autocompleteMock.record,
    lookup: vi.fn(),
  }),
}));
const apiMock = vi.hoisted(() => ({ getCourse: vi.fn() }));
vi.mock("@/src/components/providers", () => ({ useApi: () => apiMock }));

beforeEach(() => {
  scheduleMock.state.entries = structuredClone(initialEntries);
  scheduleMock.state.activeTerm = term;
  scheduleMock.state.stale = false;
  apiMock.getCourse.mockImplementation(async (code: string) => courses[code]);
  autocompleteMock.record = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("plannerGridItems", () => {
  it("normalizes planner snapshots and marks both sides of a conflict", () => {
    const items = plannerGridItems(initialEntries);

    expect(items[0]).toMatchObject({
      id: `CPSC 110::101::${term}`,
      courseKey: "CPSC 110",
      days: ["Mon", "Wed", "Fri"],
      startMin: 540,
      endMin: 600,
      conflict: true,
    });
    expect(items[1].conflict).toBe(true);
  });

  it("builds alternate slots with resulting conflict state", () => {
    const entries = structuredClone(initialEntries);
    entries[1].snapshot.days = ["Tue", "Thu"];
    entries[1].snapshot.start_time = "11:00";
    entries[1].snapshot.end_time = "12:00";
    const options = plannerDragOptions(entries, new Map([["CPSC 110", courses["CPSC 110"]]]), `CPSC 110::101::${term}`);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      id: `CPSC 110::102::${term}`,
      item: { section: "102", days: ["Tue", "Thu"], conflict: true },
    });
  });
});

describe("SchedulePlannerPane", () => {
  it("uses the shared week-first workspace with Schedule selected on mobile", async () => {
    const view = render(<SchedulePlannerPane />);

    await waitFor(() => expect(view.getAllByText("CPSC 110").length).toBeGreaterThan(0));
    expect(view.getByRole("heading", { name: "Course schedule" }).closest("header")?.className).toContain(
      "max-xl:pl-12",
    );
    expect(view.getByRole("button", { name: "Schedule" }).getAttribute("aria-pressed")).toBe("true");
    expect(view.getByRole("button", { name: "Courses" }).getAttribute("aria-pressed")).toBe("false");
    expect(view.getByRole("region", { name: "Weekly course schedule" })).toBeTruthy();
  });

  it("automatically selects a complete section combination for a new course", async () => {
    scheduleMock.state.entries = [];
    autocompleteMock.record = courses["CPSC 110"];
    render(<SchedulePlannerPane />);

    await waitFor(() =>
      expect(scheduleMock.state.addCourseSections).toHaveBeenCalledWith(courses["CPSC 110"], [
        courses["CPSC 110"].sections[0],
        courses["CPSC 110"].sections[2],
      ]),
    );
  });

  it("opens the fixed section picker from a rail card and a timetable occurrence", async () => {
    const view = render(<SchedulePlannerPane />);

    await waitFor(() => expect(view.getAllByText("CPSC 110").length).toBeGreaterThan(0));
    expect(view.queryByRole("combobox", { name: "Lecture section" })).toBeNull();
    expect(view.getByText("2 conflicting sections")).toBeTruthy();
    expect(view.getByText("· 7 credits")).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "Open CPSC 110 course details" }));
    expect(view.getByRole("dialog", { name: /CPSC 110/ })).toBeTruthy();
    expect(view.getByText("Laboratory")).toBeTruthy();
    expect(view.getByText("Conflicts with another selected section.")).toBeTruthy();

    fireEvent.change(view.getByRole("combobox", { name: "Lecture section" }), { target: { value: "102" } });
    expect(scheduleMock.state.addEntry).toHaveBeenCalledWith(courses["CPSC 110"], courses["CPSC 110"].sections[1]);

    fireEvent.click(view.getByRole("button", { name: "Close course details" }));
    const conflictBlock = view.getAllByRole("button", {
      name: /CPSC 110 101.*conflicts with another section/,
    })[0];
    fireEvent.click(conflictBlock);
    expect(view.getByRole("dialog", { name: /CPSC 110/ })).toBeTruthy();
  });

  it("keeps the hour and day grid visible in the actionable empty state", () => {
    scheduleMock.state.entries = [];
    scheduleMock.state.activeTerm = "";
    const view = render(<SchedulePlannerPane />);

    expect(view.getAllByText("Mon").length).toBeGreaterThan(0);
    expect(view.getByText("9 AM")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Browse courses" }));
    expect(view.getByRole("button", { name: "Courses" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("surfaces and removes a saved section that disappeared from its term", async () => {
    apiMock.getCourse.mockImplementation(async (code: string) =>
      code === "CPSC 110" ? { ...courses[code], sections: [] } : courses[code],
    );
    const view = render(<SchedulePlannerPane />);

    await waitFor(() => expect(view.getByText("Saved section unavailable")).toBeTruthy());
    fireEvent.click(view.getByRole("button", { name: "Open CPSC 110 course details" }));
    expect(view.getByText(/This saved section is no longer offered in this term/)).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Remove course" }));
    expect(scheduleMock.state.removeCourse).toHaveBeenCalledWith("CPSC 110", term);
  });
});
