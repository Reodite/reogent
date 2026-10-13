/** @vitest-environment happy-dom */
import type { CourseIndexEntry } from "@/src/shared/course-index";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LookupBlock } from "./lookup-block";

vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({ listeners: undefined, setNodeRef: vi.fn(), isDragging: false }),
}));

vi.mock("./course-info-popup", () => ({
  CourseInfoPopup: () => <div data-testid="course-info-popup" />,
}));

const course: CourseIndexEntry = {
  code: "CPSC 221",
  title: "Basic Algorithms and Data Structures",
  credits: 4,
  prerequisite: null,
  corequisite: null,
};

afterEach(cleanup);

describe("LookupBlock course details", () => {
  it("opens details only through the details action", () => {
    render(<LookupBlock entry={course} />);
    const button = screen.getByRole("button", { name: "Show CPSC 221 details" });

    fireEvent.click(screen.getByText(course.code));
    fireEvent.click(screen.getByText(course.title));
    expect(screen.queryByTestId("course-info-popup")).toBeNull();

    fireEvent.click(button);
    expect(screen.getByTestId("course-info-popup")).toBeTruthy();

    fireEvent.click(button);
    expect(screen.queryByTestId("course-info-popup")).toBeNull();
  });
});
