// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map<string, string>();
const storage: Storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, String(value)),
  removeItem: (key) => void memory.delete(key),
  clear: () => memory.clear(),
  key: (index) => Array.from(memory.keys())[index] ?? null,
  get length() {
    return memory.size;
  },
};
Object.defineProperty(window, "localStorage", { configurable: true, value: storage });

const { CoursePlacementSelect } = await import("./course-placement-select");
const { usePlanner } = await import("./planner-store");

const years = [
  {
    id: "year-1",
    label: "Year 1",
    terms: [
      { season: "w1" as const, kind: "study" as const, blocks: [{ id: "block-1", code: "CPSC 110" }] },
      { season: "w2" as const, kind: "coop" as const, blocks: [] },
    ],
  },
  {
    id: "year-2",
    label: "Year 2",
    terms: [{ season: "w1" as const, kind: "study" as const, blocks: [] }],
  },
];

beforeEach(() => {
  usePlanner.setState({ years, past: [], future: [] });
});

afterEach(() => {
  cleanup();
  memory.clear();
  vi.restoreAllMocks();
});

describe("CoursePlacementSelect", () => {
  it("adds through the planner store and omits co-op destinations", () => {
    const onPlaced = vi.fn();
    render(<CoursePlacementSelect mode="add" code="CPSC 121" onPlaced={onPlaced} />);
    const select = screen.getByRole("combobox", { name: "Add CPSC 121 to term" });
    expect(select.textContent).not.toContain("Winter 2");

    fireEvent.change(select, { target: { value: "1:0" } });
    expect(usePlanner.getState().years[1].terms[0].blocks.some((block) => block.code === "CPSC 121")).toBe(true);
    expect(onPlaced).toHaveBeenCalledOnce();
  });

  it("disables the current destination and appends a move predictably", () => {
    const onPlaced = vi.fn();
    render(<CoursePlacementSelect mode="move" code="CPSC 110" blockId="block-1" onPlaced={onPlaced} />);
    const select = screen.getByRole("combobox", { name: "Move CPSC 110 to term" });
    const current = screen.getByRole("option", { name: "Year 1 · Winter 1 (current)" });
    expect((current as HTMLOptionElement).disabled).toBe(true);

    fireEvent.change(select, { target: { value: "1:0" } });
    expect(usePlanner.getState().years[0].terms[0].blocks).toHaveLength(0);
    expect(usePlanner.getState().years[1].terms[0].blocks.at(-1)?.id).toBe("block-1");
    expect(onPlaced).toHaveBeenCalledOnce();
  });
});
