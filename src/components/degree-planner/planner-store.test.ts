import * as model from "@/src/lib/planner-model";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as store from "./planner-store";
import {
  applyCoopSequence,
  createPlannerYear,
  disableCoopYears,
  migratePersistedPlan,
  usePlanner,
} from "./planner-store";

vi.hoisted(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
});
afterAll(() => vi.unstubAllGlobals());

it("re-exports the original planner model values without wrapping or copying them", () => {
  expect(store.createPlannerYear).toBe(model.createPlannerYear);
  expect(store.isSummer).toBe(model.isSummer);
  expect(store.SEASON_META).toBe(model.SEASON_META);
  expect(store.TERM_CREDIT_TARGET).toBe(model.TERM_CREDIT_TARGET);
  expect(store.TERM_CREDIT_WARN).toBe(model.TERM_CREDIT_WARN);
  expect(store.MIN_YEARS).toBe(model.MIN_YEARS);
  expect(store.MAX_YEARS).toBe(model.MAX_YEARS);
  expect(store.DEFAULT_YEARS).toBe(model.DEFAULT_YEARS);
});

describe("migratePersistedPlan", () => {
  it("maps legacy terms and creates both summer terms", () => {
    const plan = migratePersistedPlan({
      years: [
        {
          id: "y1",
          label: "Year 1",
          terms: [
            { season: "fall", blocks: [{ id: "a", code: "CPSC 110" }] },
            { season: "spring", blocks: [] },
            { season: "summer", blocks: [{ id: "b", code: "CPSC 121" }] },
          ],
        },
      ],
      termsPerYear: 3,
      faculty: "The Faculty of Science",
    });

    expect(plan.schemaVersion).toBe(2);
    expect(plan.years[0].terms.map((term) => term.season)).toEqual(["w1", "w2", "s1", "s2"]);
    expect(plan.years[0].terms.map((term) => term.kind)).toEqual(["study", "study", "study", "study"]);
    expect(plan.years[0].terms[0].blocks[0].code).toBe("CPSC 110");
    expect(plan.years[0].terms[2].blocks[0].code).toBe("CPSC 121");
    expect(plan.faculty).toBe("The Faculty of Science");
  });

  it("repairs missing winter terms and preserves co-op terms", () => {
    const plan = migratePersistedPlan({
      schemaVersion: 2,
      years: [
        {
          id: "y1",
          label: "Year 1",
          terms: [{ season: "s2", kind: "coop", code: "COMM 380", blocks: [] }],
        },
      ],
      coop: true,
    });

    expect(plan.years[0].terms.map((term) => term.season)).toEqual(["w1", "w2", "s1", "s2"]);
    expect(plan.years[0].terms[3]).toMatchObject({ kind: "coop", code: "COMM 380" });
    expect(plan.coop).toBe(true);
  });
});

describe("applyCoopSequence", () => {
  beforeEach(() => {
    usePlanner.setState({
      years: Array.from({ length: 4 }, (_, index) => createPlannerYear(index)),
      past: [],
      future: [],
    });
  });

  it("keeps occupied study terms and applies the template as one reversible action", () => {
    const original = usePlanner.getState().years;
    original[2].terms[1].blocks.push({ id: "occupied", code: "CPSC 313" });
    const result = applyCoopSequence("The Faculty of Science");
    expect(result?.skippedTerms).toBe(1);
    expect(usePlanner.getState().years).toBe(result?.years);
    expect(usePlanner.getState().years[2].terms[1]).toEqual(original[2].terms[1]);
    expect(usePlanner.getState().past).toHaveLength(1);
    usePlanner.getState().undo();
    expect(usePlanner.getState().years).toBe(original);
    usePlanner.getState().redo();
    expect(usePlanner.getState().years).toBe(result?.years);
  });

  it("leaves the store and history unchanged for unsupported faculties", () => {
    const original = usePlanner.getState();
    expect(applyCoopSequence("The School of Kinesiology")).toBeNull();
    expect(usePlanner.getState()).toBe(original);
  });
});

describe("disableCoopYears", () => {
  it("reverts co-op terms to study and drops their transcript codes", () => {
    const years = [
      {
        id: "y1",
        label: "Year 1",
        terms: [
          { season: "w1" as const, kind: "study" as const, blocks: [{ id: "a", code: "CPSC 110" }] },
          { season: "s2" as const, kind: "coop" as const, code: "COMM 380", blocks: [] },
        ],
      },
    ];
    const next = disableCoopYears(years);
    expect(next?.[0].terms[1]).toMatchObject({ kind: "study", code: undefined });
    expect(next?.[0].terms[0]).toMatchObject({ kind: "study" });
    expect(next?.[0].terms[0].blocks).toHaveLength(1);
  });

  it("returns null when no term is a work term", () => {
    const years = [
      {
        id: "y1",
        label: "Year 1",
        terms: [{ season: "w1" as const, kind: "study" as const, blocks: [] }],
      },
    ];
    expect(disableCoopYears(years)).toBeNull();
  });
});
