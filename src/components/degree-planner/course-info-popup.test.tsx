/** @vitest-environment happy-dom */
import type { CourseIndexEntry } from "@/app/api/course-index/route";
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
  vi.unstubAllGlobals();
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

  it("renders each placement issue as a direct error box", () => {
    render(<Popup course={course} issues={["duplicate course in plan", "prereq CPSC 210"]} />);

    const duplicate = screen.getByText("Duplicate course: it already appears elsewhere in your plan.");
    const prerequisite = screen.getByText("Prerequisite: complete CPSC 210 in an earlier term.");
    expect(duplicate.className).toContain("bg-error-container");
    expect(prerequisite.className).toContain("bg-error-container");
    expect(screen.queryByText("Why it’s flagged")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("uses shared viewport bounds and scrolling for long descriptions on a narrow screen", async () => {
    vi.stubGlobal("innerWidth", 320);
    vi.stubGlobal("innerHeight", 480);
    const description = "A detailed course description. ".repeat(100);
    api.getCourse.mockResolvedValueOnce({ description });
    const { container } = render(<Popup course={{ ...course, code: "CPSC 310" }} />);
    await screen.findByText(description.trim());

    const panel = screen.getByRole("dialog");
    expect(container.contains(panel)).toBe(false);
    expect(panel.hasAttribute("data-floating-panel")).toBe(true);
    expect(panel.classList.contains("w-80")).toBe(true);
    expect(panel.classList.contains("neu-panel")).toBe(true);
    expect(panel.classList.contains("bg-surface")).toBe(true);
    expect(panel.classList.contains("[&>*]:shrink-0")).toBe(true);
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.maxWidth).toBe("var(--floating-available-width)");
    expect(panel.style.getPropertyValue("--floating-available-width")).toBe("304px");
    expect(panel.style.maxHeight).toBe("var(--floating-available-height)");
    expect(panel.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(panel);

    const close = screen.getByRole("button", { name: "Close course details" });
    const header = close.parentElement!;
    expect(header.parentElement).toBe(panel);
    expect(header.contains(screen.getByRole("heading", { level: 4 }))).toBe(true);
    expect(header.contains(screen.getByText(description.trim()))).toBe(false);
    expect(header.classList.contains("sticky")).toBe(true);
    expect(header.classList.contains("top-0")).toBe(true);
    expect(header.classList.contains("z-10")).toBe(true);
    expect(header.classList.contains("bg-surface")).toBe(true);
    expect(header.classList.contains("-mx-4")).toBe(true);
    expect(header.classList.contains("-mt-4")).toBe(true);
    expect(header.classList.contains("-mb-2.5")).toBe(true);
    expect(header.classList.contains("px-4")).toBe(true);
    expect(header.classList.contains("pt-4")).toBe(true);
    expect(header.classList.contains("pb-2.5")).toBe(true);
    expect(panel.querySelector(".overflow-y-auto, .overflow-auto")).toBeNull();

    const finder = screen.getByRole("link", { name: "Open in Course Finder" });
    expect(finder.getAttribute("href")).toBe("/tools/courses/CPSC310");
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
