/** @vitest-environment happy-dom */
import type { CourseIndexEntry } from "@/src/shared/course-index";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseBlock } from "./course-block";
import { LookupBlock } from "./lookup-block";
import type { BlockValidation } from "./validation";

vi.mock("@/src/components/providers", () => ({
  useApi: () => ({ getCourse: () => Promise.resolve({ description: null }) }),
}));

const activators = vi.hoisted(() => ({
  mouseDown: vi.fn(),
  touchStart: vi.fn(),
}));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    listeners: {
      onMouseDown: activators.mouseDown,
      onTouchStart: activators.touchStart,
    },
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({ listeners: undefined, setNodeRef: vi.fn(), isDragging: false }),
}));

const course: CourseIndexEntry = {
  code: "CPSC 221",
  title: "Basic Algorithms and Data Structures",
  credits: 4,
  prerequisite: null,
  corequisite: null,
};

const validation: BlockValidation = {
  ok: true,
  missing: [],
  completedBefore: new Set(),
  completedSameOrBefore: new Set(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Course chip details", () => {
  it.each(["lookup", "placed"])("connects the %s info trigger to its floating dialog", (kind) => {
    render(
      kind === "lookup" ? (
        <LookupBlock entry={course} />
      ) : (
        <CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} />
      ),
    );
    const trigger = screen.getByRole("button", { name: "Show CPSC 221 details" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.hasAttribute("aria-controls")).toBe(false);

    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "CPSC 221 details" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Course chip controls", () => {
  it("makes drag previews inert and hides them from assistive technology", () => {
    const { container, rerender } = render(<LookupBlock entry={course} />);
    rerender(<LookupBlock entry={course} ghost />);
    const lookupGhost = container.firstElementChild as HTMLElement;
    expect(lookupGhost.hasAttribute("inert")).toBe(true);
    expect(lookupGhost.getAttribute("aria-hidden")).toBe("true");

    rerender(<CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} />);
    const placed = container.firstElementChild as HTMLElement;
    expect(placed.hasAttribute("inert")).toBe(false);

    rerender(<CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} ghost />);
    const blockGhost = container.firstElementChild as HTMLElement;
    expect(blockGhost.hasAttribute("inert")).toBe(true);
  });

  it("offers removal only for placed courses", () => {
    const { container, rerender } = render(<LookupBlock entry={course} />);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.querySelector('[aria-label="Remove CPSC 221"]')).toBeNull();

    rerender(<CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} />);
    expect(screen.getByRole("button", { name: "Remove CPSC 221" })).toBeTruthy();
  });

  it("opens and closes the term picker and omits it from drag previews", () => {
    const { rerender } = render(
      <CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    const select = screen.getByRole("combobox", { name: "Move CPSC 221 to term" });
    const disclosure = select.closest("[data-disclosure]");
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(disclosure?.getAttribute("aria-hidden")).toBe("true");
    expect(disclosure?.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(select.closest("[inert]")).toBeNull();

    rerender(<CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} ghost />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("keeps the course code and removal when catalog metadata is missing", () => {
    const { rerender } = render(
      <CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} />,
    );
    rerender(<CourseBlock blockId="block-1" code={course.code} entry={undefined} validation={validation} />);
    expect(screen.getAllByText(course.code).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Remove CPSC 221" })).toBeTruthy();
  });
});

describe("CourseBlock drag activation", () => {
  it("forwards mouse and touch activators from the chip but not its controls", () => {
    const { container } = render(
      <CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} />,
    );
    const chip = container.querySelector<HTMLElement>("[data-block-id='block-1']");
    if (!chip) throw new Error("Missing course chip");

    const code = screen.getByText(course.code);
    fireEvent.mouseDown(code, { button: 0 });
    fireEvent.touchStart(code, { touches: [{ clientX: 10, clientY: 10 }] });

    expect(activators.mouseDown).toHaveBeenCalledTimes(1);
    expect(activators.touchStart).toHaveBeenCalledTimes(1);

    for (const button of chip.querySelectorAll("button")) {
      fireEvent.mouseDown(button, { button: 0 });
      fireEvent.touchStart(button, { touches: [{ clientX: 10, clientY: 10 }] });
    }

    expect(activators.mouseDown).toHaveBeenCalledTimes(1);
    expect(activators.touchStart).toHaveBeenCalledTimes(1);
  });
});
