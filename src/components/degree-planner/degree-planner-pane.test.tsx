// @vitest-environment happy-dom
import { createPlannerYear } from "@/src/lib/planner-model";
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
const programs = vi.hoisted(() => ({ getRequirementsFor: vi.fn() }));
vi.mock("@/src/lib/program-requirements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/program-requirements")>()),
  getRequirementsFor: programs.getRequirementsFor,
}));

const { DegreePlannerPane } = await import("./degree-planner-pane");

afterEach(() => {
  cleanup();
  usePlanner.setState(usePlanner.getInitialState());
  vi.clearAllMocks();
  programs.getRequirementsFor.mockReset();
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

describe("planner autofill", () => {
  it("fills a curated program through the button and undoes the batch in one step", async () => {
    const year = createPlannerYear(0);
    usePlanner.setState({ years: [year], major: "curated-major", past: [], future: [] });
    api.getCourseIndex.mockResolvedValue({
      courses: [
        { code: "CPSC 110", title: "Computation", credits: 4, prerequisite: null, corequisite: null },
        { code: "CPSC 210", title: "Software Construction", credits: 4, prerequisite: "CPSC 110", corequisite: null },
      ],
    });
    programs.getRequirementsFor.mockResolvedValue({
      kind: "structured",
      program_url: "/program",
      categories: [
        { name: "Required courses", credits_required: 8, options: [{ code: "CPSC 110" }, { code: "CPSC 210" }] },
      ],
    });
    render(<DegreePlannerPane />);
    fireEvent.click(await screen.findByRole("button", { name: "Autofill" }));

    await screen.findByText("Added 2 courses");
    expect(programs.getRequirementsFor).toHaveBeenCalledWith("curated-major");
    expect(usePlanner.getState().years[0].terms.map((term) => term.blocks.map((block) => block.code))).toEqual([
      ["CPSC 110"],
      ["CPSC 210"],
    ]);
    expect(usePlanner.getState().past).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Autofill" }));
    await screen.findByText("Course requirements are covered");
    expect(usePlanner.getState().past).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(usePlanner.getState().years).toEqual([year]);
  });

  it.each([null, { kind: "structured", program_url: "/program", categories: [] }])(
    "reports unavailable requirements without changing the plan: %j",
    async (requirements) => {
      const year = createPlannerYear(0);
      usePlanner.setState({ years: [year], major: "empty-major", past: [], future: [] });
      api.getCourseIndex.mockResolvedValue({ courses: [] });
      programs.getRequirementsFor.mockResolvedValue(requirements);
      render(<DegreePlannerPane />);
      fireEvent.click(await screen.findByRole("button", { name: "Autofill" }));

      await screen.findByText(/No course requirements are available for this program/);
      expect(usePlanner.getState().years).toEqual([year]);
      expect(usePlanner.getState().past).toHaveLength(0);
    },
  );
});
