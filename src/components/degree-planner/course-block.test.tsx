/** @vitest-environment happy-dom */
import type { CourseIndexEntry } from "@/app/api/course-index/route";
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

function chipLayout(chip: HTMLElement) {
  return [chip, ...chip.querySelectorAll<HTMLElement>("div, button, span")].map((element) => ({
    tag: element.tagName,
    classes: element.className.trim(),
  }));
}

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

describe("Course chip layout", () => {
  it("keeps shared typography and mirrors each source layout in its drag preview", () => {
    const { container, rerender } = render(<LookupBlock entry={course} />);
    const source = container.firstElementChild as HTMLElement;
    const layout = chipLayout(source);

    expect(source.querySelector(".font-mono")).toBeNull();

    rerender(<LookupBlock entry={course} ghost />);
    const lookupGhost = container.firstElementChild as HTMLElement;
    expect(chipLayout(lookupGhost)).toEqual(layout);
    expect(lookupGhost.hasAttribute("inert")).toBe(true);
    expect(lookupGhost.getAttribute("aria-hidden")).toBe("true");

    rerender(<CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} />);
    const placed = container.firstElementChild as HTMLElement;
    const placedLayout = chipLayout(placed);
    expect(placedLayout[0]).toEqual(layout[0]);
    expect(placedLayout.filter(({ tag }) => tag === "SPAN")).toEqual(layout.filter(({ tag }) => tag === "SPAN"));
    expect(placed.hasAttribute("inert")).toBe(false);

    rerender(<CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} ghost />);
    const blockGhost = container.firstElementChild as HTMLElement;
    expect(chipLayout(blockGhost)).toEqual(placedLayout);
    expect(blockGhost.hasAttribute("inert")).toBe(true);
  });

  it("omits the remove slot from finder cards and gives actions their natural width", () => {
    const { container, rerender } = render(<LookupBlock entry={course} />);
    const chip = container.firstElementChild as HTMLElement;
    const add = screen.getByRole("button", { name: "Add" });
    expect(chip.querySelectorAll("button")).toHaveLength(2);
    expect(chip.querySelector('[aria-label="Remove CPSC 221"]')).toBeNull();
    expect(chip.querySelector(".invisible")).toBeNull();
    expect(add.classList.contains("w-14")).toBe(false);
    expect(add.parentElement?.lastElementChild).toBe(add);

    rerender(<CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} />);
    expect(container.querySelectorAll("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Remove CPSC 221" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move" }).classList.contains("w-14")).toBe(false);
  });

  it("keeps course text outside a separate square details button", () => {
    const { rerender } = render(<LookupBlock entry={course} />);

    function checkDetailsButton() {
      expect(screen.getByText(course.code).closest("button")).toBeNull();
      expect(screen.getByText(course.title).closest("button")).toBeNull();
      const details = screen.getByRole("button", { name: "Show CPSC 221 details" });
      expect(details.textContent).toBe("");
      expect(details.querySelector("svg")).toBeTruthy();
      expect(details.classList.contains("size-11")).toBe(true);
      expect(details.classList.contains("sm:size-8")).toBe(true);
      expect(details.classList.contains("p-0")).toBe(true);
      expect(details.hasAttribute("style")).toBe(false);
    }

    checkDetailsButton();
    expect(screen.getByRole("button", { name: "Add" }).hasAttribute("style")).toBe(false);

    rerender(<CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} />);
    checkDetailsButton();
    expect(screen.getByRole("button", { name: "Move" }).hasAttribute("style")).toBe(false);
  });

  it("keeps the term picker outside the measured drag surface", () => {
    const { container, rerender } = render(
      <CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} />,
    );
    const layout = chipLayout(container.firstElementChild as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    const select = screen.getByRole("combobox", { name: "Move CPSC 221 to term" });
    expect(select.closest("[data-block-id]")).toBeNull();
    expect(select.classList.contains("shrink-0")).toBe(true);
    const disclosure = select.closest("[data-disclosure]");
    expect(disclosure?.contains(select)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(disclosure?.getAttribute("aria-hidden")).toBe("true");
    expect(disclosure?.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(select.closest("[inert]")).toBeNull();
    expect(chipLayout(container.firstElementChild as HTMLElement)).toEqual(layout);

    rerender(<CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} ghost />);
    expect(chipLayout(container.firstElementChild as HTMLElement)).toEqual(layout);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("keeps the code and action slots when catalog metadata is missing", () => {
    const { container, rerender } = render(
      <CourseBlock blockId="block-1" code={course.code} entry={course} validation={validation} />,
    );
    const layout = chipLayout(container.firstElementChild as HTMLElement);
    rerender(<CourseBlock blockId="block-1" code={course.code} entry={undefined} validation={validation} />);
    expect(chipLayout(container.firstElementChild as HTMLElement)).toEqual(layout);
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
