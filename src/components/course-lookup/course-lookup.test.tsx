// @vitest-environment happy-dom
import { CourseDetailCard } from "@/src/components/course-lookup/course-detail-card";
import { CourseLookupPane } from "@/src/components/course-lookup/course-lookup-pane";
import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import { ApiError } from "@/src/lib/api-types";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setActiveChannel = vi.hoisted(() => vi.fn());
const shellState = vi.hoisted(() => ({ mode: "ai" as string | undefined }));
const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => "/",
}));

vi.mock("@/src/components/chat/chat-shell-context", () => ({
  useChatShell: () => ({ setActiveChannel, mode: shellState.mode }),
}));

const apiState = vi.hoisted(() => ({
  getCourse: vi.fn() as (code: string) => Promise<unknown>,
  searchCourses: vi.fn() as (params: unknown) => Promise<{ courses: unknown[]; subject_total?: number }>,
}));

vi.mock("@/src/components/providers", () => ({
  useApi: () => apiState,
}));

const sections: CourseSection[] = [
  {
    section: "101",
    term: "2026-27 Winter Term 1",
    days: ["Mon", "Wed", "Fri"],
    start_time: "09:00",
    end_time: "10:00",
    instructor: "C. Karakus",
  },
];

const fullRecord: CourseDoc = {
  code: "CPSC 110",
  subject: "CPSC",
  number: "110",
  title: "Computation, Programs, and Programming",
  description: "Foundations of computation and programs.",
  credits: 4,
  prerequisite: "CPSC 103",
  corequisite: null,
  sections,
  terms: ["2026-27 Winter Term 1"],
  total_sections: 1,
};

const sparseRecord: CourseDoc = {
  code: "MATH 100",
  subject: "MATH",
  number: "100",
  title: "Calculus I",
  description: "",
  credits: null,
  prerequisite: null,
  corequisite: null,
  sections: [],
  terms: [],
  total_sections: 0,
};

beforeEach(() => {
  setActiveChannel.mockReset();
  apiState.getCourse.mockReset();
  apiState.searchCourses.mockReset();
  routerPush.mockReset();
  shellState.mode = "ai";
  window.localStorage?.clear();
});

afterEach(() => cleanup());

describe("CourseDetailCard — render with sections (13.6, REQ-2.1)", () => {
  it("renders code, title, credits, description, prerequisite, terms, and a section row", () => {
    const { container } = render(<CourseDetailCard record={fullRecord} />);
    expect(container.textContent).toContain("CPSC 110");
    expect(container.textContent).toContain("Computation, Programs, and Programming");
    expect(container.textContent).toContain("4 cr");
    expect(container.textContent).toContain("Foundations of computation and programs.");
    expect(container.textContent).toContain("Prerequisite");
    expect(container.textContent).toContain("CPSC 103");
    expect(container.textContent).toContain("2026-27 Winter Term 1");
    expect(container.textContent).toContain("Mon Wed Fri");
    expect(container.textContent).toContain("09:00-10:00");
    expect(container.textContent).toContain("C. Karakus");
    expect(screen.getByText("1 section").className).toContain("whitespace-nowrap");
  });
});

describe("CourseDetailCard — null-or-empty field omission (13.7, REQ-2.2)", () => {
  it("omits credits badge, description, corequisite, offered, sections, and the Prereq Tree affordance when those fields are absent", () => {
    const { container } = render(<CourseDetailCard record={sparseRecord} />);
    expect(container.textContent).not.toContain("cr");
    // Only the title paragraph renders when description is empty.
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.textContent).not.toContain("Corequisite");
    expect(container.textContent).not.toContain("Offered");
    expect(screen.queryByText("Mon Wed Fri")).toBeNull();
    expect(container.querySelector('[data-action="open-prereq-tree"]')).toBeNull();
  });
});

describe("CourseDetailCard — Prereq Tree affordance (13.11, REQ-4.1)", () => {
  it("opens the prereq tree pane rooted at the record's code on click", () => {
    const { container } = render(
      <CourseDetailCard
        record={fullRecord}
        onOpenPrereqs={(code) => setActiveChannel("prereq-tree", { root: code, query: code, selections: {} })}
      />,
    );
    const affordance = container.querySelector('[data-action="open-prereq-tree"]') as HTMLButtonElement;
    expect(affordance).not.toBeNull();
    expect(affordance.getAttribute("data-code")).toBe("CPSC 110");
    fireEvent.click(affordance);
    expect(setActiveChannel).toHaveBeenCalledWith("prereq-tree", {
      root: "CPSC 110",
      query: "CPSC 110",
      selections: {},
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function makeCourse(code: string, subject: string, number: string, title?: string): CourseDoc {
  return {
    code,
    subject,
    number,
    title: title ?? `${code} — ${subject}`,
    description: "",
    credits: null,
    prerequisite: null,
    corequisite: null,
    sections: [],
    terms: [],
    total_sections: 0,
  };
}

describe("course-lookup-pane — subject cap 200 + footer notice (13.8, REQ-3.2)", () => {
  it("renders the subject listing capped at 200 with the 'Showing first 200 of N' footer", async () => {
    const subjectCourses = Array.from({ length: 200 }, (_, i) =>
      makeCourse(`CPSC ${100 + i}`, "CPSC", String(100 + i)),
    );
    apiState.searchCourses.mockResolvedValue({ courses: subjectCourses, subject_total: 205 });
    const setState = vi.fn();
    render(<CourseLookupPane state={{ code: "" }} setState={setState} />);
    fireEvent.change(screen.getByLabelText("Course code"), { target: { value: "CPSC" } });
    await waitFor(() => expect(apiState.searchCourses).toHaveBeenCalled());
    expect(await screen.findByText(/Showing first 200 of 205/)).not.toBeNull();
    expect(document.querySelectorAll("[data-course-list] button")).toHaveLength(200);
    expect(apiState.searchCourses).toHaveBeenCalledWith({ subject: "CPSC" });
  });
});

describe("course-lookup-pane — external code drive (widget navigation)", () => {
  it("updates the lookup when a new course code enters via state, and keeps user typing", async () => {
    apiState.getCourse.mockResolvedValue(makeCourse("CPSC 110", "CPSC", "110"));
    const setState = vi.fn();
    const view = render(<CourseLookupPane state={{ code: "" }} setState={setState} />);

    // External drive: a widget opens the pane to CPSC 110.
    view.rerender(<CourseLookupPane state={{ code: "CPSC 110" }} setState={setState} />);
    await waitFor(() => expect(apiState.getCourse).toHaveBeenCalledWith("CPSC 110", "2025W"));

    // User typing after the drive is not clobbered back to the prop.
    apiState.getCourse.mockClear();
    fireEvent.change(screen.getByLabelText("Course code"), { target: { value: "CPSC 121" } });
    expect((screen.getByLabelText("Course code") as HTMLInputElement).value).toBe("CPSC 121");
  });
});

describe("course-lookup-pane — dead exact code narrows to same-number match (13.9, REQ-3.5)", () => {
  it("on a dead canonical code, subject search filters by exact number — no q-fuzzy spew", async () => {
    const subjectCourses = Array.from({ length: 12 }, (_, i) => makeCourse(`CPSC ${110 + i}`, "CPSC", String(110 + i)));
    apiState.getCourse.mockImplementation(async () => {
      throw new ApiError(404, "No course");
    });
    apiState.searchCourses.mockResolvedValue({ courses: subjectCourses });
    const setState = vi.fn();
    render(<CourseLookupPane state={{ code: "" }} setState={setState} />);
    fireEvent.change(screen.getByLabelText("Course code"), { target: { value: "CPSC 999" } });
    await waitFor(() => {
      expect(document.querySelectorAll("[data-course-list] button")).toHaveLength(0);
    });
    expect(await screen.findByText(/No courses matching CPSC 999/)).not.toBeNull();
    expect(apiState.searchCourses).toHaveBeenCalledWith({ subject: "CPSC" });
  });
});

describe("course-lookup-pane — partial-code narrows by number-prefix (13.9, REQ-3.5)", () => {
  it("calls subject+number search and renders the server-filtered matches verbatim", async () => {
    // Simulate the server's response (contains-prefix match, sorted ascending, capped at 8).
    const cpscMatched = [
      "CPSC_V 110",
      "CPSC_V 111",
      "CPSC_V 112",
      "CPSC_V 113",
      "CPSC_V 114",
      "CPSC_V 117",
      "CPSC_V 211",
      "CPSC_V 311",
    ].map((code) => {
      const [subject, number] = code.split(" ");
      return makeCourse(code, subject, number);
    });
    apiState.searchCourses.mockResolvedValue({ courses: cpscMatched, subject_total: 12 });
    const setState = vi.fn();
    render(<CourseLookupPane state={{ code: "" }} setState={setState} />);
    fireEvent.change(screen.getByLabelText("Course code"), { target: { value: "CPSC 11" } });
    await waitFor(() => {
      expect(document.querySelectorAll("[data-course-list] button")).toHaveLength(8);
    });
    const firstRow = document.querySelector("[data-course-list] button .font-mono")?.textContent.trim();
    expect(firstRow).toBe("CPSC_V 110");
    expect(apiState.searchCourses).toHaveBeenCalledWith({ subject: "CPSC", number: "11" });
  });
});

describe("course-lookup-pane — partial-code falls back to title search when subject isn't real (13.9)", () => {
  it("drops the trailing number and q-searches the subject fragment for title matching", async () => {
    apiState.searchCourses.mockImplementation(async (params: { subject?: string; number?: string; q?: string }) => {
      if (params.subject && params.number) return { courses: [], subject_total: 0 };
      if (params.q === "CALC") {
        return {
          courses: [
            makeCourse("MATH_V 402", "MATH_V", "402", "Calculus of Variations"),
            makeCourse("MATH_V 190", "MATH_V", "190", "Calculus Survey"),
            makeCourse("MATH_V 317", "MATH_V", "317", "Calculus IV"),
            makeCourse("MATH_V 200", "MATH_V", "200", "Calculus III"),
          ],
        };
      }
      return { courses: [] };
    });
    const setState = vi.fn();
    render(<CourseLookupPane state={{ code: "" }} setState={setState} />);
    fireEvent.change(screen.getByLabelText("Course code"), { target: { value: "calc 3" } });
    await waitFor(() => expect(apiState.searchCourses).toHaveBeenCalledWith({ q: "CALC" }));
    const rows = [...document.querySelectorAll("[data-course-list] button .font-mono")].map((n) =>
      n.textContent.trim(),
    );
    expect(rows).toContain("MATH_V 200");
  });
});

describe("course-lookup-pane — partial-subject fallback (CPS → CPSC/CPEN)", () => {
  it("falls back to q search filtered by subject-prefix when the subject code is not in the catalog", async () => {
    apiState.searchCourses.mockImplementation(async (params: { subject?: string; q?: string }) => {
      if (params.subject) return { courses: [], subject_total: 0 };
      return {
        courses: [
          makeCourse("CPSC 110", "CPSC_V", "110"),
          makeCourse("CPSC 121", "CPSC_V", "121"),
          makeCourse("BIOF 200", "BIOF_V", "200"),
        ],
      };
    });
    const setState = vi.fn();
    render(<CourseLookupPane state={{ code: "" }} setState={setState} />);
    fireEvent.change(screen.getByLabelText("Course code"), { target: { value: "CPS" } });
    await waitFor(() => expect(apiState.searchCourses).toHaveBeenCalledWith({ q: "CPS" }));
    const listedCodes = [...document.querySelectorAll("[data-course-list] button .font-mono")].map((n) =>
      n.textContent.trim(),
    );
    expect(listedCodes).toEqual(["CPSC 110", "CPSC 121"]);
  });
});

describe("course-lookup-pane — tools-mode list/detail split", () => {
  it("AI mode hides the browse list entirely", () => {
    shellState.mode = "ai";
    apiState.searchCourses.mockResolvedValue({ courses: [], subject_total: 0 });
    render(<CourseLookupPane state={{ code: "" }} setState={vi.fn()} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByLabelText("Sort by")).toBeNull();
  });

  it("tools mode with no code shows the browse list and loads it without a query", async () => {
    shellState.mode = "tools";
    apiState.searchCourses.mockResolvedValue({
      courses: [makeCourse("CPSC 110", "CPSC_V", "110")],
      subject_total: 1,
    });
    render(<CourseLookupPane state={{ code: "" }} setState={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("table")).not.toBeNull());
    expect(screen.getByRole("heading", { level: 1, name: "Course lookup" })).not.toBeNull();
    expect(screen.getByLabelText("Find a course")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Filters" })).not.toBeNull();
    expect(document.querySelector("[data-workspace-region='rail']")).toBeNull();
    expect(document.querySelector("[data-workspace-view-toggle]")).toBeNull();
    expect(document.querySelector("[data-workspace-canvas]")).not.toBeNull();
    expect(apiState.searchCourses).toHaveBeenCalledWith(expect.objectContaining({ sort: "students_desc" }));
  });

  it("tools mode exact-code search narrows by subject and number", async () => {
    shellState.mode = "tools";
    apiState.searchCourses.mockResolvedValue({
      courses: [makeCourse("CPSC 320", "CPSC_V", "320")],
      subject_total: 1,
    });
    render(<CourseLookupPane state={{ code: "" }} setState={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Find a course"), { target: { value: "CPSC 320" } });

    await waitFor(() =>
      expect(apiState.searchCourses).toHaveBeenLastCalledWith(
        expect.objectContaining({ subject: "CPSC", number: "320" }),
      ),
    );
  });

  it("ignores an older unfiltered response after an exact search settles", async () => {
    shellState.mode = "tools";
    const initial = deferred<{ courses: CourseDoc[]; subject_total: number }>();
    const exact = deferred<{ courses: CourseDoc[]; subject_total: number }>();
    apiState.searchCourses = vi.fn().mockReturnValueOnce(initial.promise).mockReturnValueOnce(exact.promise);
    render(<CourseLookupPane state={{ code: "" }} setState={vi.fn()} />);
    await waitFor(() => expect(apiState.searchCourses).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Find a course"), { target: { value: "CPSC 320" } });
    await waitFor(() => expect(apiState.searchCourses).toHaveBeenCalledTimes(2));
    await act(async () => exact.resolve({ courses: [makeCourse("CPSC 320", "CPSC_V", "320")], subject_total: 1 }));
    expect(await screen.findByRole("button", { name: "CPSC 320" })).not.toBeNull();

    await act(async () => initial.resolve({ courses: [makeCourse("MATH 100", "MATH_V", "100")], subject_total: 1 }));
    expect(screen.queryByRole("button", { name: "MATH 100" })).toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  it("reveals advanced filters without a separate workspace view", async () => {
    shellState.mode = "tools";
    apiState.searchCourses.mockResolvedValue({ courses: [], subject_total: 0 });
    render(<CourseLookupPane state={{ code: "" }} setState={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("region", { name: "Advanced course filters" })).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "300" } });
    expect(screen.getByRole("button", { name: "Filters (1)" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Show courses" })).toBeNull();
  });

  it("tools mode row click navigates to the course detail URL", async () => {
    shellState.mode = "tools";
    apiState.searchCourses.mockResolvedValue({
      courses: [makeCourse("MATH 100", "MATH_V", "100")],
      subject_total: 1,
    });
    render(<CourseLookupPane state={{ code: "" }} setState={vi.fn()} />);
    const codeButton = await screen.findByRole("button", { name: "MATH 100" });
    fireEvent.click(codeButton);
    expect(routerPush).toHaveBeenCalledWith("/tools/courses/MATH100");
  });

  it("tools mode with a code in state shows only the detail (no table) and fetches that course", async () => {
    shellState.mode = "tools";
    apiState.getCourse.mockResolvedValue(fullRecord);
    render(<CourseLookupPane state={{ code: "MATH 100" }} setState={vi.fn()} />);
    expect(screen.queryByRole("table")).toBeNull();
    await waitFor(() => expect(document.querySelector("[data-action='open-prereq-tree']")).not.toBeNull());
    expect(screen.getAllByText("CPSC 110").length).toBeGreaterThan(0);
    fireEvent.click(document.querySelector("[data-action='open-prereq-tree']") as HTMLElement);
    expect(routerPush).toHaveBeenCalledWith("/tools/prereq/CPSC110");
  });

  it("back button returns to the list URL", async () => {
    shellState.mode = "tools";
    apiState.getCourse.mockResolvedValue(fullRecord);
    render(<CourseLookupPane state={{ code: "MATH 100" }} setState={vi.fn()} />);
    const back = await screen.findByRole("button", { name: "Back to results" });
    expect(back.textContent).toBe("");
    fireEvent.click(back);
    expect(routerPush).toHaveBeenCalledWith("/tools/courses");
  });

  it("replaces a settled network failure skeleton with recovery", async () => {
    shellState.mode = "tools";
    apiState.getCourse.mockRejectedValue(new Error("offline"));
    render(<CourseLookupPane state={{ code: "MATH 100" }} setState={vi.fn()} />);

    expect(screen.getByRole("status", { name: "Loading course details" })).not.toBeNull();
    expect(await screen.findByText("Course unavailable")).not.toBeNull();
    expect(screen.queryByRole("status", { name: "Loading course details" })).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).not.toBeNull();
  });

  it("shows a clear not-found exit after an exact 404 settles", async () => {
    shellState.mode = "tools";
    apiState.getCourse.mockRejectedValue(new ApiError(404, "missing"));
    apiState.searchCourses.mockResolvedValue({ courses: [], subject_total: 0 });
    render(<CourseLookupPane state={{ code: "MATH 999" }} setState={vi.fn()} />);

    expect(await screen.findByText("Course not found")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
    expect(routerPush).toHaveBeenCalledWith("/tools/courses");
  });
});
