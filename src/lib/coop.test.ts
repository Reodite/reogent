import { createPlannerYear } from "@/src/components/degree-planner/planner-store";
import { describe, expect, it } from "vitest";
import { buildCoopSequence } from "./coop";

describe("buildCoopSequence", () => {
  it("rejects faculties without co-op", () => {
    expect(buildCoopSequence("The School of Kinesiology", [createPlannerYear(0)])).toBeNull();
  });

  it("adds both summer terms and extends the plan", () => {
    const original = Array.from({ length: 4 }, (_, index) => createPlannerYear(index));
    const result = buildCoopSequence("The Faculty of Science", original);

    expect(result?.years).toHaveLength(5);
    expect(result?.years[1].terms.map((term) => term.season)).toEqual(["w1", "w2", "s1", "s2"]);
    expect(result?.years[1].terms.slice(2).map((term) => term.kind)).toEqual(["coop", "coop"]);
    expect(result?.years[4].terms.every((term) => term.kind === "study")).toBe(true);
    expect(original[1].terms).toHaveLength(2);
  });

  it("keeps occupied work-term slots unchanged", () => {
    const years = Array.from({ length: 4 }, (_, index) => createPlannerYear(index));
    years[2].terms[1].blocks.push({ id: "placed", code: "CPSC 313" });

    const result = buildCoopSequence("The Faculty of Science", years);

    expect(result?.skippedTerms).toBe(1);
    expect(result?.years[2].terms[1]).toMatchObject({ kind: "study" });
    expect(result?.years[2].terms[1].blocks[0].code).toBe("CPSC 313");
  });

  it("adds faculty co-op courses without duplicates", () => {
    const years = Array.from({ length: 4 }, (_, index) => createPlannerYear(index));
    years[1].terms[1].blocks.push({ id: "existing", code: "ARTC 100" });

    const result = buildCoopSequence("The Faculty of Arts", years);
    const codes = result?.years.flatMap((year) => year.terms.flatMap((term) => term.blocks.map((block) => block.code)));

    expect(codes?.filter((code) => code === "ARTC 100")).toHaveLength(1);
    expect(codes).toEqual(expect.arrayContaining(["ARTC 100", "ARTC 200", "ARTC 300"]));
    expect(result?.years[1].terms[2]).toMatchObject({ kind: "coop", code: "ARTC 110" });
  });
});
