// @vitest-environment happy-dom

import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PlannerCourseModule } from "./planner-course-module";
import { entryId, type ScheduleEntry } from "./schedule-store";

const term = "2026-27 Winter Term 1";

function section(sectionCode: string, days: string[], start: string): CourseSection {
  return {
    section: sectionCode,
    term,
    days,
    start_time: start,
    end_time: `${String(Number(start.slice(0, 2)) + 1).padStart(2, "0")}:00`,
    status: "Open",
  };
}

const sections = [
  section("101", ["m", "w", "f"], "09:00"),
  section("102", ["t", "th"], "11:00"),
  section("L1A", ["th"], "14:00"),
  section("R01", ["f"], "12:00"),
  section("W-L", ["t"], "15:00"),
];

const doc: CourseDoc = {
  code: "CPSC 110",
  subject: "CPSC",
  number: "110",
  title: "Computation, Programs, and Programming",
  description: "",
  credits: 4,
  prerequisite: null,
  corequisite: null,
  terms: [term],
  sections,
};

function entry(sectionCode: string, instructor: string | null = null): ScheduleEntry {
  const candidate = sections.find((section) => section.section === sectionCode)!;
  return {
    code: "CPSC 110",
    section: sectionCode,
    term,
    snapshot: {
      title: doc.title,
      instructor,
      days: candidate.days,
      start_time: candidate.start_time,
      end_time: candidate.end_time,
      status: candidate.status ?? null,
    },
  };
}

const baseProps = {
  code: "CPSC 110",
  title: doc.title,
  doc,
  term,
  entries: [entry("101")],
  conflictingIds: new Set<string>(),
  onSelectSection: vi.fn(),
  onRemove: vi.fn(),
  onFocusHandled: vi.fn(),
};

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlannerCourseModule", () => {
  it("shows conflict status only for conflicting courses and keeps removal actionable", () => {
    const onRemove = vi.fn();
    const view = render(
      <PlannerCourseModule
        {...baseProps}
        conflictingIds={new Set([entryId(baseProps.entries[0])])}
        onRemove={onRemove}
      />,
    );
    expect(view.getByText("Conflict").className).toContain("bg-error-container");
    fireEvent.click(view.getByRole("button", { name: `Remove CPSC 110 from ${term}` }));
    expect(onRemove).toHaveBeenCalledOnce();
    view.rerender(<PlannerCourseModule {...baseProps} />);
    expect(view.queryByText("Conflict")).toBeNull();
  });

  it("reserves section controls until a course without cached entries resolves", () => {
    const view = render(<PlannerCourseModule {...baseProps} doc={undefined} entries={[]} />);
    expect(
      view.getByRole("status", { name: "Loading CPSC 110 section options" }).querySelector("[data-skeleton]"),
    ).toBeTruthy();
    expect(
      view.queryByText("No sections are listed for this term. Cached meetings remain on the timetable."),
    ).toBeNull();
    view.rerender(<PlannerCourseModule {...baseProps} entries={[]} doc={{ ...doc, sections: [] }} />);
    expect(view.container.querySelector("[data-skeleton]")).toBeNull();
    expect(
      view.getByText("No sections are listed for this term. Cached meetings remain on the timetable."),
    ).toBeTruthy();
  });

  it("keeps known selectors visible and independent additional groups disclosed", () => {
    const view = render(<PlannerCourseModule {...baseProps} />);

    const lectureSelect = view.getByLabelText<HTMLSelectElement>("Lecture");
    expect(Array.from(lectureSelect.options, (option) => option.textContent)).toEqual(["Choose section", "101", "102"]);
    expect(lectureSelect.className).toContain("min-h-11");
    expect(lectureSelect.className).toContain("sm:min-h-9");
    const remove = view.getByRole("button", { name: "Remove CPSC 110 from 2026-27 Winter Term 1" });
    expect(remove.className).toContain("size-11");
    expect(remove.className).toContain("sm:size-8");
    expect(view.getByLabelText("Laboratory")).toBeTruthy();
    expect(view.getByText("2 not selected automatically")).toBeTruthy();
    expect(view.getByLabelText("R sections")).toBeTruthy();
    expect(view.getByLabelText("W sections")).toBeTruthy();
    expect(view.container.querySelector("details")?.open).toBe(false);
  });

  it("keeps native Additional focus paint outside the article and rounds only its closed hover edge", async () => {
    const view = render(<PlannerCourseModule {...baseProps} />);
    const article = view.container.querySelector("article")!;
    const details = article.querySelector("details")!;
    const summary = details.querySelector("summary")!;
    const lecture = view.getByLabelText<HTMLSelectElement>("Lecture");
    expect(article.classList.contains("overflow-hidden")).toBe(false);
    expect(article.classList.contains("rounded-lg")).toBe(true);
    expect(article.classList.contains("border")).toBe(true);
    expect(details.classList.contains("group/additional")).toBe(true);
    expect(summary.getAttribute("role")).toBeNull();
    expect(summary.getAttribute("tabindex")).toBeNull();
    expect(summary.classList.contains("min-h-11")).toBe(true);
    expect(summary.classList.contains("rounded-b-[calc(var(--radius-lg)-1px)]")).toBe(true);
    expect(summary.classList.contains("group-open/additional:rounded-b-none")).toBe(true);
    fireEvent.click(summary);
    await waitFor(() => expect(details.open).toBe(true));
    fireEvent.click(summary);
    await waitFor(() => expect(details.open).toBe(false));
    expect(view.getByLabelText("Lecture")).toBe(lecture);
    expect(lecture.value).toBe("101");
  });

  it("puts meeting time and instructor on separate sans-serif lines", () => {
    const view = render(<PlannerCourseModule {...baseProps} entries={[entry("101", "Danica Sutherland")]} />);

    const meeting = view.getByText("Mon/Wed/Fri · 09:00–10:00");
    const instructor = view.getByText("Danica Sutherland");
    expect(meeting.tagName).toBe("P");
    expect(instructor.tagName).toBe("P");
    expect(meeting).not.toBe(instructor);
    expect(view.container.querySelector(".font-mono")).toBeNull();
  });

  it("changes one inline component selector", () => {
    const onSelectSection = vi.fn();
    const view = render(<PlannerCourseModule {...baseProps} onSelectSection={onSelectSection} />);

    fireEvent.change(view.getByLabelText("Lecture"), { target: { value: "102" } });
    expect(onSelectSection).toHaveBeenCalledWith(baseProps.entries[0], sections[1]);
  });

  it("expands additional component types when one is selected", () => {
    const view = render(<PlannerCourseModule {...baseProps} entries={[entry("101"), entry("R01")]} />);
    expect(view.container.querySelector("details")?.open).toBe(true);
    expect(view.getByText("1 not selected automatically")).toBeTruthy();
  });

  it("focuses the requested component after the module renders", async () => {
    const onFocusHandled = vi.fn();
    const view = render(
      <PlannerCourseModule
        {...baseProps}
        focusRequest={{ group: "laboratory", token: 1 }}
        onFocusHandled={onFocusHandled}
      />,
    );

    await waitFor(() => expect(document.activeElement).toBe(view.getByLabelText("Laboratory")));
    expect(onFocusHandled).toHaveBeenCalledOnce();
  });
});
