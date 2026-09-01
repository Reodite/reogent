/** @vitest-environment happy-dom */
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseInfoPopup } from "./course-info-popup";

vi.mock("@/src/components/providers", () => ({
  useApi: () => ({ getCourse: () => Promise.resolve({ description: null }) }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: PropsWithChildren) => <a href="/">{children}</a>,
}));

const course: CourseIndexEntry = {
  code: "CPSC 221",
  title: "Basic Algorithms and Data Structures",
  credits: 4,
  prerequisite: null,
  corequisite: null,
};

afterEach(cleanup);

describe("CourseInfoPopup pointer handling", () => {
  it("does not pass pointer activation to the draggable card", () => {
    const parentPointerDown = vi.fn();
    render(
      <div onPointerDown={parentPointerDown}>
        <CourseInfoPopup course={course} anchorRect={new DOMRect(100, 100, 28, 28)} />
      </div>,
    );

    fireEvent.pointerDown(screen.getByRole("dialog", { name: "CPSC 221 details" }));

    expect(parentPointerDown).not.toHaveBeenCalled();
  });

  it("renders each placement issue as a direct error box", () => {
    render(
      <CourseInfoPopup
        course={course}
        anchorRect={new DOMRect(100, 100, 28, 28)}
        issues={["duplicate course in plan", "prereq CPSC 210"]}
      />,
    );

    const duplicate = screen.getByText("Duplicate course: it already appears elsewhere in your plan.");
    const prerequisite = screen.getByText("Prerequisite: complete CPSC 210 in an earlier term.");
    expect(duplicate.className).toContain("bg-error-container");
    expect(prerequisite.className).toContain("bg-error-container");
    expect(screen.queryByText("Why it’s flagged")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
