// @vitest-environment happy-dom
import { CourseDetailCard } from "@/src/components/course-lookup/course-detail-card";
import { CourseLookupPane } from "@/src/components/course-lookup/course-lookup-pane";
import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import { ApiError } from "@/src/lib/api-types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setActiveChannel = vi.hoisted(() => vi.fn());

vi.mock("@/src/components/chat/chat-shell-context", () => ({
  useChatShell: () => ({ setActiveChannel }),
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
    const { container } = render(<CourseDetailCard record={fullRecord} />);
    const affordance = container.querySelector('[data-action="open-prereq-tree"]') as HTMLButtonElement;
    expect(affordance).not.toBeNull();
    expect(affordance.getAttribute("data-code")).toBe("CPSC 110");
    fireEvent.click(affordance);
    expect(setActiveChannel).toHaveBeenCalledWith("prereq-tree", { root: "CPSC 110", selections: {} });
  });
});

function makeCourse(code: string, subject: string, number: string): CourseDoc {
  return {
    code,
    subject,
    number,
    title: `${code} — ${subject}`,
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
