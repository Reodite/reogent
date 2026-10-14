/** @vitest-environment happy-dom */
import type { CourseIndexEntry } from "@/src/shared/course-index";
import { parsePrereq } from "@/src/shared/prereq-ast";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState, type ComponentProps, type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseInfoPopup } from "./course-info-popup";

const api = vi.hoisted(() => ({ getCourse: vi.fn(() => Promise.resolve({ description: null as string | null })) }));

vi.mock("@/src/components/providers", () => ({ useApi: () => api }));

vi.mock("next/link", () => ({
  default: ({ children, href }: PropsWithChildren<{ href: string }>) => <a href={href}>{children}</a>,
}));

const course: CourseIndexEntry = {
  code: "CPSC 221",
  title: "Basic Algorithms and Data Structures",
  credits: 4,
  prerequisite: null,
  corequisite: null,
};

function Popup({
  onClose,
  ...props
}: Omit<ComponentProps<typeof CourseInfoPopup>, "anchorRef" | "onClose"> & {
  onClose?: () => void;
}) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" ref={anchorRef} onClick={() => setOpen(true)}>
        Show details
      </button>
      {open ? (
        <CourseInfoPopup
          {...props}
          anchorRef={anchorRef}
          onClose={() => {
            setOpen(false);
            onClose?.();
          }}
        />
      ) : null}
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  api.getCourse.mockReset();
});

describe("CourseInfoPopup", () => {
  it("does not pass pointer activation to the draggable card", () => {
    const parentPointerDown = vi.fn();
    render(
      <div onPointerDown={parentPointerDown}>
        <Popup course={course} />
      </div>,
    );

    fireEvent.pointerDown(screen.getByRole("dialog", { name: "CPSC 221 details" }));

    expect(parentPointerDown).not.toHaveBeenCalled();
  });

  it("explains duplicate and prerequisite placement issues", () => {
    render(<Popup course={course} issues={["duplicate course in plan", "prereq CPSC 210"]} />);

    expect(screen.getByText("Duplicate course: it already appears elsewhere in your plan.")).not.toBeNull();
    expect(screen.getByText("Prerequisite: complete CPSC 210 in an earlier term.")).not.toBeNull();
  });

  it("loads descriptions once and restores focus after Escape", async () => {
    const description = "A detailed course description. ".repeat(100);
    api.getCourse.mockResolvedValueOnce({ description });
    render(<Popup course={{ ...course, code: "CPSC 310" }} />);
    await screen.findByText(description.trim());

    const panel = screen.getByRole("dialog");
    expect(document.activeElement).toBe(panel);

    const finder = screen.getByRole("link", { name: "Open in Course Finder" });
    expect(finder.getAttribute("href")).toBe("/app/tools/courses/CPSC310");
    finder.focus();
    expect(document.activeElement).toBe(finder);
    fireEvent.keyDown(finder, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show details" }));

    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    await screen.findByText(description.trim());
    expect(api.getCourse).toHaveBeenCalledTimes(1);
  });

  it("dismisses through the close action and outside pointer activation", () => {
    const onClose = vi.fn();
    render(<Popup course={course} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close course details" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show details" }));

    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("preserves verbatim prerequisite text and highlights only unmet clauses", async () => {
    const prerequisite = "CPSC 110 and either CPSC 210 or CPSC 213.";
    render(
      <Popup
        course={{ ...course, prerequisite }}
        prereqAst={parsePrereq(prerequisite)}
        completedBefore={new Set(["CPSC 110"])}
      />,
    );

    const panel = screen.getByRole("dialog");
    await waitFor(() => expect(panel.textContent).toContain(prerequisite));
    const marks = panel.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent?.trim()).toBe("either CPSC 210 or CPSC 213");
  });
});
