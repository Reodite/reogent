// @vitest-environment happy-dom
import type { Candidate } from "@/src/components/course-search/course-search";
import type { CourseDoc } from "@/src/lib/api-types";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SchedulePlannerPane } from "./schedule-planner-pane";

const term = "2026-27 Winter Term 1";
const nextTerm = "2026-27 Winter Term 2";

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
  "MATH 200": {
    code: "MATH 200",
    subject: "MATH",
    number: "200",
    title: "Calculus III",
    description: "",
    credits: 3,
    prerequisite: null,
    corequisite: null,
    terms: [nextTerm],
    sections: [
      {
        section: "201",
        term: nextTerm,
        days: ["Tue", "Thu"],
        start_time: "10:00",
        end_time: "11:30",
      },
    ],
  },
  "HIST 100": {
    code: "HIST 100",
    subject: "HIST",
    number: "100",
    title: "History without sections",
    description: "",
    credits: 3,
    prerequisite: null,
    corequisite: null,
    terms: [],
    sections: [],
  },
};

const cpscEntry = {
  code: "CPSC 110",
  section: "101",
  term,
  snapshot: {
    title: "Computation, Programs, and Programming",
    instructor: null,
    days: ["Mon", "Wed", "Fri"],
    start_time: "09:00",
    end_time: "10:00",
    status: null,
  },
};

const scheduleMock = vi.hoisted(() => ({
  state: {
    entries: [] as (typeof cpscEntry)[],
    activeTerm: "2026-27 Winter Term 1",
    stale: false,
    addEntry: vi.fn(),
    addCourseSections: vi.fn(),
    importSections: vi.fn(),
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

const autocompleteMock = vi.hoisted(() => ({
  list: null as { candidates: Candidate[]; total: number } | null,
  status: "idle" as "idle" | "loading",
  error: null as string | null,
  rejected: false,
  record: null as CourseDoc | null,
  lookup: vi.fn(),
}));

vi.mock("@/src/components/course-search/course-search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/src/components/course-search/course-search")>();
  return {
    ...original,
    useCourseAutocomplete: () => autocompleteMock,
  };
});

const apiMock = vi.hoisted(() => ({ getCourse: vi.fn() }));
vi.mock("@/src/components/providers", () => ({ useApi: () => apiMock }));

function candidate(doc: CourseDoc): Candidate {
  return {
    code: doc.code,
    subject: doc.subject,
    number: doc.number,
    title: doc.title,
    terms: doc.terms,
  };
}

function setRecord(doc: CourseDoc) {
  autocompleteMock.record = doc;
  autocompleteMock.list = null;
}

function setCandidates(...docs: CourseDoc[]) {
  autocompleteMock.record = null;
  autocompleteMock.list = { candidates: docs.map(candidate), total: docs.length };
}

beforeEach(() => {
  scheduleMock.state.entries = [];
  scheduleMock.state.activeTerm = term;
  scheduleMock.state.stale = false;
  autocompleteMock.list = null;
  autocompleteMock.status = "idle";
  autocompleteMock.error = null;
  autocompleteMock.rejected = false;
  autocompleteMock.record = null;
  apiMock.getCourse.mockImplementation(async (code: string) => courses[code]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SchedulePlannerPane explicit course flow", () => {
  it("does not write for a resolved full code until its result is clicked", async () => {
    setRecord(courses["CPSC 110"]);
    const view = render(<SchedulePlannerPane />);
    const input = view.getByRole("combobox", { name: "Find a course to schedule" });

    fireEvent.change(input, { target: { value: "CPSC 110" } });
    const option = await view.findByRole("option", { name: new RegExp(`CPSC 110.*Add to ${term}`) });
    expect(scheduleMock.state.addCourseSections).not.toHaveBeenCalled();
    expect(scheduleMock.state.addEntry).not.toHaveBeenCalled();

    fireEvent.click(option);
    await waitFor(() => expect(scheduleMock.state.addCourseSections).toHaveBeenCalledTimes(1));
  });

  it("adds a complete course selection to the active term", async () => {
    setRecord(courses["CPSC 110"]);
    const view = render(<SchedulePlannerPane />);
    fireEvent.change(view.getByRole("combobox"), { target: { value: "CPSC 110" } });
    fireEvent.click(await view.findByRole("option", { name: new RegExp(`Add to ${term}`) }));

    await waitFor(() =>
      expect(scheduleMock.state.addCourseSections).toHaveBeenCalledWith(courses["CPSC 110"], [
        courses["CPSC 110"].sections[0],
        courses["CPSC 110"].sections[2],
      ]),
    );
  });

  it("offers and atomically activates the deterministic off-term target", async () => {
    setRecord(courses["MATH 200"]);
    const view = render(<SchedulePlannerPane />);
    fireEvent.change(view.getByRole("combobox"), { target: { value: "MATH 200" } });
    const option = await view.findByRole("option", {
      name: new RegExp(`Add and switch to ${nextTerm}`),
    });

    fireEvent.click(option);
    await waitFor(() =>
      expect(scheduleMock.state.addCourseSections).toHaveBeenCalledWith(
        courses["MATH 200"],
        courses["MATH 200"].sections,
        { activateTerm: true },
      ),
    );
    expect(scheduleMock.state.setActiveTerm).not.toHaveBeenCalled();
  });

  it("focuses an already-added course without writing", async () => {
    scheduleMock.state.entries = [structuredClone(cpscEntry)];
    setRecord(courses["CPSC 110"]);
    const view = render(<SchedulePlannerPane />);
    await view.findByRole("combobox", { name: "Lecture" });
    const input = view.getByRole("combobox", { name: "Find a course to schedule" });
    fireEvent.change(input, { target: { value: "CPSC 110" } });
    const option = await view.findByRole("option", { name: /Added — focus course/ });

    fireEvent.click(option);
    const module = view.container.querySelector<HTMLElement>("[data-planner-course='CPSC 110']");
    await waitFor(() => expect(document.activeElement).toBe(module));
    expect(scheduleMock.state.addCourseSections).not.toHaveBeenCalled();
    expect(scheduleMock.state.addEntry).not.toHaveBeenCalled();
    expect(scheduleMock.state.setActiveTerm).not.toHaveBeenCalled();
  });

  it("switches to an already-added off-term course without writing", async () => {
    scheduleMock.state.entries = [
      {
        code: "MATH 200",
        section: "201",
        term: nextTerm,
        snapshot: {
          title: courses["MATH 200"].title,
          instructor: null,
          days: ["Tue", "Thu"],
          start_time: "10:00",
          end_time: "11:30",
          status: null,
        },
      },
    ];
    setRecord(courses["MATH 200"]);
    const view = render(<SchedulePlannerPane />);
    fireEvent.change(view.getByRole("combobox"), { target: { value: "MATH 200" } });

    fireEvent.click(await view.findByRole("option", { name: new RegExp(`Added — switch to ${nextTerm}`) }));
    await waitFor(() => expect(scheduleMock.state.setActiveTerm).toHaveBeenCalledWith(nextTerm));
    expect(scheduleMock.state.addCourseSections).not.toHaveBeenCalled();
  });

  it("retains the query and exposes retry after a failed commit", async () => {
    setCandidates(courses["CPSC 110"]);
    apiMock.getCourse.mockRejectedValue(new Error("offline"));
    const view = render(<SchedulePlannerPane />);
    const input = view.getByRole("combobox", { name: "Find a course to schedule" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "CPSC" } });
    fireEvent.click(await view.findByRole("option", { name: new RegExp(`Add to ${term}`) }));

    await view.findByRole("alert");
    expect(input.value).toBe("CPSC");
    expect(view.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(scheduleMock.state.addCourseSections).not.toHaveBeenCalled();
  });

  it("ignores a commit completion after the query changes", async () => {
    setCandidates(courses["CPSC 110"]);
    let resolveCourse: ((doc: CourseDoc) => void) | undefined;
    apiMock.getCourse.mockImplementation(
      () =>
        new Promise<CourseDoc>((resolve) => {
          resolveCourse = resolve;
        }),
    );
    const view = render(<SchedulePlannerPane />);
    const input = view.getByRole("combobox", { name: "Find a course to schedule" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "CPSC" } });
    fireEvent.click(await view.findByRole("option", { name: new RegExp(`Add to ${term}`) }));
    fireEvent.change(input, { target: { value: "MATH" } });
    resolveCourse?.(courses["CPSC 110"]);

    await waitFor(() => expect(input.value).toBe("MATH"));
    expect(scheduleMock.state.addCourseSections).not.toHaveBeenCalled();
  });

  it("omits course and credit totals from the header", async () => {
    scheduleMock.state.entries = [structuredClone(cpscEntry)];
    const view = render(<SchedulePlannerPane />);
    await view.findByRole("combobox", { name: "Lecture" });

    expect(view.queryByText("1 courses")).toBeNull();
    expect(view.queryByText("4 credits")).toBeNull();
  });

  it("changes exactly one component with an inline section selector", async () => {
    scheduleMock.state.entries = [structuredClone(cpscEntry)];
    const view = render(<SchedulePlannerPane />);
    const lecture = await view.findByRole("combobox", { name: "Lecture" });

    fireEvent.change(lecture, { target: { value: "102" } });
    expect(scheduleMock.state.addEntry).toHaveBeenCalledWith(courses["CPSC 110"], courses["CPSC 110"].sections[1]);
    expect(scheduleMock.state.removeEntry).not.toHaveBeenCalled();
  });

  it("focuses the exact component selector when a timetable block is activated", async () => {
    scheduleMock.state.entries = [structuredClone(cpscEntry)];
    const view = render(<SchedulePlannerPane />);
    const lecture = await view.findByRole("combobox", { name: "Lecture" });
    const block = view.getAllByRole("button", { name: /CPSC 110.*101/ })[0];

    fireEvent.click(block);
    await waitFor(() => expect(document.activeElement).toBe(lecture));
    expect(view.getByRole("button", { name: "Courses" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not derive terms or course modules from a discovery record", async () => {
    scheduleMock.state.activeTerm = "";
    setRecord(courses["CPSC 110"]);
    const view = render(<SchedulePlannerPane />);
    fireEvent.change(view.getByRole("combobox"), { target: { value: "CPSC 110" } });
    await view.findByRole("option", { name: /CPSC 110/ });

    expect(view.getByText("Terms appear after you add a course.")).toBeTruthy();
    expect(view.container.querySelector("[data-planner-course]")).toBeNull();
    expect(scheduleMock.state.setActiveTerm).not.toHaveBeenCalled();
  });

  it("marks no-term results unavailable without a commit", async () => {
    setRecord(courses["HIST 100"]);
    const view = render(<SchedulePlannerPane />);
    fireEvent.change(view.getByRole("combobox"), { target: { value: "HIST 100" } });

    const option = await view.findByRole("option", { name: /No offered sections/ });
    expect(option.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(option);
    expect(scheduleMock.state.addCourseSections).not.toHaveBeenCalled();
  });

  it("keeps search and import fixed around the only scrolling rail region", () => {
    const view = render(<SchedulePlannerPane />);
    const root = view.container.querySelector<HTMLElement>("[data-planner-controls]");
    const search = view.container.querySelector<HTMLElement>("[data-planner-search]");
    const list = view.container.querySelector<HTMLElement>("[data-planner-course-list]");
    const footer = view.container.querySelector<HTMLElement>("[data-planner-import]");

    expect(root?.className).toContain("h-full");
    expect(root?.className).toContain("min-h-0");
    expect(search?.className).toContain("shrink-0");
    expect(search?.className).not.toContain("overflow-y-auto");
    expect(list?.className).toContain("min-h-0");
    expect(list?.className).toContain("overflow-y-auto");
    expect(footer?.className).toContain("shrink-0");
    expect(view.getByRole("button", { name: /Import Workday schedule/ })).toBeTruthy();
  });

  it("moves to course controls and focuses search from the empty timetable", async () => {
    const view = render(<SchedulePlannerPane />);
    const input = view.getByRole("combobox", { name: "Find a course to schedule" });

    fireEvent.click(view.getByRole("button", { name: "Browse courses" }));
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(view.getByRole("button", { name: "Courses" }).getAttribute("aria-pressed")).toBe("true");
  });
});
