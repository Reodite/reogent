import { afterAll, describe, expect, it, vi } from "vitest";

const { storeLoads, storageReads } = vi.hoisted(() => {
  const storageReads = vi.fn();
  vi.stubGlobal(
    "localStorage",
    new Proxy(
      {},
      {
        get: (_, key) => {
          storageReads(key);
          throw new Error("Planner calculations accessed storage");
        },
      },
    ),
  );
  return { storeLoads: vi.fn(), storageReads };
});
vi.mock("zustand", () => {
  storeLoads();
  throw new Error("Planner calculations loaded Zustand");
});
afterAll(() => vi.unstubAllGlobals());

// Feature: codebase-restructuring, Requirements 2.1 and 2.2.
describe("planner calculation isolation", () => {
  it("loads and runs placement, autofill, and co-op calculations without the store or storage", async () => {
    const { findCourseTarget } = await import("./planner-placement");
    const { buildAutofillPlan } = await import("./planner-autofill");
    const { buildCoopSequence } = await import("./coop");
    expect(findCourseTarget([], new Map(), "CPSC 110", 0)).toBeNull();
    expect(
      buildAutofillPlan({
        years: [],
        courseIndex: new Map(),
        parsed: { years: [], degreeTotalCredits: null },
        programUrl: "",
        checkedRequirements: [],
      }),
    ).toEqual({ placements: [], placedCodes: [], choices: [], remaining: [] });
    expect(buildCoopSequence("The Faculty of Science", [])?.years).toHaveLength(5);
    expect(storeLoads).not.toHaveBeenCalled();
    expect(storageReads).not.toHaveBeenCalled();
  });
});
