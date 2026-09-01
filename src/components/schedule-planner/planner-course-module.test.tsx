// @vitest-environment happy-dom

import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PlannerCourseModule } from "./planner-course-module";
import type { ScheduleEntry } from "./schedule-store";

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

function entry(sectionCode: string): ScheduleEntry {
  const candidate = sections.find((section) => section.section === sectionCode)!;
  return {
    code: "CPSC 110",
    section: sectionCode,
    term,
    snapshot: {
      title: doc.title,
      instructor: null,
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
  it("keeps known selectors visible and independent additional groups disclosed", () => {
    const view = render(<PlannerCourseModule {...baseProps} />);

    expect(view.getByLabelText("Lecture")).toBeTruthy();
    expect(view.getByLabelText("Laboratory")).toBeTruthy();
    expect(view.getByText("2 not selected automatically")).toBeTruthy();
    expect(view.getByLabelText("R sections")).toBeTruthy();
    expect(view.getByLabelText("W sections")).toBeTruthy();
    expect(view.container.querySelector("details")?.open).toBe(false);
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
