import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { transformBuilding } from "./buildings";
import { modules } from "./index";
import { transformTuition } from "./tuition";

describe("ingest document IDs", () => {
  const tuitionRow = fc.record({
    unit: fc.constant("per_credit"),
    amount: fc.double({ min: 0, max: 5000, noNaN: true }),
    program: fc.string({ minLength: 1, maxLength: 40 }),
    student_type: fc.constantFrom("domestic", "international"),
    cohort_year: fc.option(fc.integer({ min: 2000, max: 2030 }), { nil: null }),
    cohort_rule: fc.option(fc.constantFrom("exactly" as const, "or_later" as const), { nil: null }),
  });

  // Feature: reodite, Property 8: Ingest document IDs are deterministic and unique
  it("Property 8: IDs are stable across calls and differ when the natural key differs", () => {
    fc.assert(
      fc.property(tuitionRow, tuitionRow, (a, b) => {
        const ta = transformTuition(a);
        expect(ta?.id).toBe(transformTuition(a)?.id); // deterministic
        const tb = transformTuition(b);
        const keyOf = (r: typeof a) =>
          `${transformTuition(r)?.doc.program_slug}#${r.student_type}#${r.cohort_year}#${r.cohort_rule}`;
        if (ta && tb && keyOf(a) !== keyOf(b)) expect(ta.id).not.toBe(tb.id);
      }),
      { numRuns: 200 },
    );
  });

  it("building transform keys by BLDG_CODE and skips codeless features", () => {
    const f = {
      properties: { BLDG_CODE: "ICCS", NAME: "ICICS" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-123.25, 49.26],
            [-123.251, 49.261],
            [-123.249, 49.26],
          ],
        ],
      },
    };
    const t = transformBuilding(f);
    expect(t?.id).toBe("ICCS");
    expect(t?.doc.lat).toBeCloseTo(49.2603, 3);
    expect(transformBuilding({ properties: {}, geometry: f.geometry })).toBeNull();
  });
});

describe("module registry consistency", () => {
  it("tool, index, and geo names are unique across modules", () => {
    for (const names of [
      modules.flatMap((m) => m.tools.map((t) => t.spec.name)),
      modules.flatMap((m) => m.indices.map((i) => i.index)),
      modules.flatMap((m) => (m.geo ?? []).map((g) => g.name)),
    ]) {
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("exposes exactly the 14 redesigned tools with no legacy names", () => {
    expect(new Set(modules.flatMap((m) => m.tools.map((t) => t.spec.name)))).toEqual(
      new Set([
        "find_courses",
        "get_course",
        "get_prereq_tree",
        "find_building",
        "walking_distance",
        "find_places",
        "find_study_spaces",
        "get_costs",
        "find_programs",
        "get_admission_requirements",
        "find_events",
        "get_key_dates",
        "search_ubc_pages",
        "show_widget",
      ]),
    );
  });

  it("every tool spec has typed, described properties and a required list", () => {
    for (const tool of modules.flatMap((m) => m.tools)) {
      expect(tool.spec.description.length).toBeGreaterThan(0);
      const schema = tool.spec.inputSchema.json as {
        type: string;
        properties: Record<string, { type?: string; description?: string }>;
        required: string[];
      };
      expect(schema.type).toBe("object");
      expect(Array.isArray(schema.required)).toBe(true);
      expect(Object.keys(schema.properties).length).toBeGreaterThan(0);
      for (const prop of Object.values(schema.properties)) {
        expect(prop.type).toBeTruthy();
        expect(prop.description).toBeTruthy();
      }
      for (const req of schema.required) expect(schema.properties[req]).toBeDefined();
    }
  });
});
