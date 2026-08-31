import { describe, expect, it } from "vitest";
import { migratePersistedPlan } from "./planner-store";

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
