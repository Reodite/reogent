/** @vitest-environment happy-dom */
import type { CourseIndexEntry } from "@/app/api/course-index/route";
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
  it("preserves vertical touch panning while keeping explicit actions", () => {
    const { container } = render(<LookupBlock entry={course} />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("touch-pan-y");
    expect(row.className).not.toContain("touch-none");
    const button = screen.getByRole("button", { name: "Show CPSC 221 details" });

    fireEvent.click(button);
    expect(screen.getByTestId("course-info-popup")).toBeTruthy();

    fireEvent.click(button);
    expect(screen.queryByTestId("course-info-popup")).toBeNull();
  });
});
