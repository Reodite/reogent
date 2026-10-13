// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { usePlanner, type Year } from "./planner-store";

vi.hoisted(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json([])),
  );
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

describe("DegreePlannerPane", () => {
  it("allows view switching while the course index loads", () => {
    api.getCourseIndex.mockReturnValue(new Promise(() => {}));
    const { container } = render(<DegreePlannerPane />);
    const page = container.querySelector("[data-workspace-page]");
    expect(screen.getByRole("status", { name: "Loading course index…" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Requirements and courses" }));
    expect(page?.getAttribute("data-workspace-view")).toBe("rail");
  });

  it("opens and dismisses Structure and Issues dialogs", async () => {
    api.getCourseIndex.mockResolvedValue({ courses: [] });
    render(<DegreePlannerPane />);
    const trigger = await screen.findByRole("button", { name: "Structure" });
    fireEvent.click(trigger);
    const structure = screen.getByRole("dialog", { name: "Plan structure" });
    expect(trigger.getAttribute("aria-controls")).toBe(structure.id);
    expect(screen.getByRole("combobox", { name: "Years in plan" })).not.toBeNull();
    fireEvent.keyDown(structure, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Plan structure" })).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(screen.getByRole("button", { name: "Issues" }));
    expect(screen.getByRole("dialog", { name: "Placement issues" })).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Placement issues" })).toBeNull();
  });

  it("keeps an open Move picker through summer toggles and course additions", async () => {
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
    const card = container.querySelector<HTMLElement>('[data-block-id="block-0"]')!;
    const list = card.parentElement!;

    fireEvent.click(within(card).getByRole("button", { name: "Move" }));
    const select = screen.getByRole("combobox", { name: "Move CPSC 100 to term" });

    fireEvent.click(screen.getByRole("button", { name: "Add summer session" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove summer session" }));
    act(() => usePlanner.getState().addBlock(year.id, 0, "CPSC 221"));

    expect(container.querySelector('[data-block-id="block-0"]')).toBe(card);
    expect(screen.getByRole("combobox", { name: "Move CPSC 100 to term" })).toBe(select);
    expect(list.querySelectorAll("[data-block-id]")).toHaveLength(21);
  });

  it("offers retry feedback when the index fails", async () => {
    api.getCourseIndex.mockRejectedValue(new Error("offline"));
    render(<DegreePlannerPane />);
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
  });
});
