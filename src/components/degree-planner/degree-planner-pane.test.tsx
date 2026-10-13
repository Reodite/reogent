// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { usePlanner, type Year } from "./planner-store";

vi.hoisted(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
const api = vi.hoisted(() => ({ getCourseIndex: vi.fn() }));
vi.mock("@/src/components/providers", () => ({ useApi: () => api }));
vi.mock("./use-plan-sync", () => ({ usePlanSync: () => {} }));

const { DegreePlannerPane } = await import("./degree-planner-pane");

afterEach(() => {
  cleanup();
  usePlanner.setState(usePlanner.getInitialState());
  vi.clearAllMocks();
});

afterAll(() => vi.unstubAllGlobals());

describe("planner loading layout", () => {
  it("preserves both rail panels, board padding, and compact view switching", () => {
    api.getCourseIndex.mockReturnValue(new Promise(() => {}));
    const { container } = render(<DegreePlannerPane />);
    const page = container.querySelector("[data-workspace-page]");
    expect(page?.getAttribute("data-workspace-composition")).toBe("split");
    expect(container.querySelectorAll("[data-workspace-panel]")).toHaveLength(2);
    expect(container.querySelector("[data-workspace-canvas]")?.className).toContain("p-4");
    expect(
      screen.getByRole("status", { name: "Loading course index…" }).querySelector("[data-skeleton]"),
    ).not.toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Requirements and courses" }));
    expect(page?.getAttribute("data-workspace-view")).toBe("rail");
  });

  it("opens Structure and Issues outside the clipped workspace toolbar", async () => {
    api.getCourseIndex.mockResolvedValue({ courses: [] });
    const { container } = render(<DegreePlannerPane />);
    const trigger = await screen.findByRole("button", { name: "Structure" });
    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(undo.parentElement?.classList.contains("rounded-lg")).toBe(true);
    expect(undo.classList.contains("rounded-sm")).toBe(true);
    expect(redo.classList.contains("rounded-sm")).toBe(true);
    fireEvent.click(trigger);
    const structure = screen.getByRole("dialog", { name: "Plan structure" });
    expect(container.contains(structure)).toBe(false);
    expect(trigger.getAttribute("aria-controls")).toBe(structure.id);
    expect(screen.getByRole("combobox", { name: "Years in plan" })).not.toBeNull();
    fireEvent.keyDown(structure, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Plan structure" })).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(screen.getByRole("button", { name: "Issues" }));
    const issues = screen.getByRole("dialog", { name: "Placement issues" });
    expect(container.contains(issues)).toBe(false);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Placement issues" })).toBeNull();
  });

  it("keeps the loaded board minimum and winter card identity through summer toggles and an open Move", async () => {
    const year: Year = {
      id: "year-height",
      label: "Year 1",
      terms: [
        {
          season: "w1",
          kind: "study",
          blocks: Array.from({ length: 20 }, (_, i) => ({ id: `block-${i}`, code: `CPSC ${100 + i}` })),
        },
        { season: "w2", kind: "study", blocks: [] },
      ],
    };
    usePlanner.setState({ years: [year], coop: true, past: [], future: [] });
    api.getCourseIndex.mockResolvedValue({ courses: [] });
    const { container } = render(<DegreePlannerPane />);
    await screen.findByRole("button", { name: "Structure" });
    const board = screen.getByRole("region", { name: "Degree plan" }).firstElementChild as HTMLElement;
    const card = container.querySelector<HTMLElement>('[data-block-id="block-0"]')!;
    const list = card.parentElement!;
    const winter = list.parentElement!;

    expect(board.classList.contains("min-h-min")).toBe(true);
    expect(board.style.gridTemplateColumns).toBe("repeat(1, minmax(18rem, 1fr))");
    fireEvent.click(within(card).getByRole("button", { name: "Move" }));
    const select = screen.getByRole("combobox", { name: "Move CPSC 100 to term" });
    const disclosure = select.closest("[data-disclosure]");
    expect(select.closest("[data-block-id]")).toBeNull();
    expect(select.parentElement?.hasAttribute("data-disclosure-content")).toBe(true);
    expect(list.contains(disclosure)).toBe(true);
    list.scrollTop = 80;

    fireEvent.click(screen.getByRole("button", { name: "Add summer session" }));
    expect(container.querySelector("[data-summer-terms]")?.children).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove summer session" }));
    act(() => usePlanner.getState().addBlock(year.id, 0, "CPSC 221"));

    expect(container.querySelector('[data-block-id="block-0"]')).toBe(card);
    expect(card.parentElement).toBe(list);
    expect(list.parentElement).toBe(winter);
    expect(screen.getByRole("combobox", { name: "Move CPSC 100 to term" })).toBe(select);
    expect(select.closest("[data-disclosure]")).toBe(disclosure);
    expect(select.parentElement?.hasAttribute("data-disclosure-content")).toBe(true);
    expect(list.scrollTop).toBe(80);
    expect(list.querySelectorAll("[data-block-id]")).toHaveLength(21);
    expect(list.classList.contains("min-h-36")).toBe(true);
    expect(list.classList.contains("[contain:size]")).toBe(true);
    expect(list.classList.contains("overflow-y-auto")).toBe(true);
  });

  it("replaces skeletons with retry feedback when the index fails", async () => {
    api.getCourseIndex.mockRejectedValue(new Error("offline"));
    const { container } = render(<DegreePlannerPane />);
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
    expect(container.querySelector("[data-skeleton]")).toBeNull();
  });
});
