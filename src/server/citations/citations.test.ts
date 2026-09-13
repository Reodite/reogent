import type { CourseDoc } from "@/src/server/modules/courses";
import type { Citation, CitationKind } from "@/src/shared/citations/citation";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allocateCitations } from "./allocator";
import { CITATION_EXTRACTORS, type CitationSeed } from "./extractors";
import { stampUsed } from "./stamp-used";

const arbKind: fc.Arbitrary<CitationKind> = fc.constantFrom(
  "course",
  "program",
  "event",
  "calendar",
  "page",
  "generic",
);

const arbSeed: fc.Arbitrary<CitationSeed> = fc.record({
  label: fc.string({ minLength: 1, maxLength: 40 }),
  kind: arbKind,
  tool: fc.string({ minLength: 1, maxLength: 20 }),
  source_url: fc.option(fc.webUrl()),
  detail: fc.option(
    fc.record({
      subject: fc.option(fc.string({ minLength: 1 })),
      number: fc.option(fc.string({ minLength: 1 })),
      date: fc.option(fc.string({ minLength: 1 })),
    }),
  ),
});

/** Text seeded with explicit [N] markers interspersed with prose. */
const arbTextWithMarkers: fc.Arbitrary<string> = fc
  .array(fc.tuple(fc.string({ maxLength: 20 }), fc.integer({ min: 0, max: 12 })), { maxLength: 8 })
  .map((pairs) => pairs.map(([s, n]) => `${s} [${n}] `).join(""));

const extract = (name: keyof typeof CITATION_EXTRACTORS) => {
  const fn = CITATION_EXTRACTORS[name];
  if (!fn) throw new Error(`no extractor registered for ${name}`);
  return fn;
};

describe("allocateCitations — Property 18, Index-1 continuity", () => {
  it("assigned index values form exactly 1..length with no gaps or duplicates", () => {
    fc.assert(
      fc.property(fc.array(arbSeed, { maxLength: 30 }), (seeds) => {
        const result = allocateCitations(seeds);
        const indices = result.map((c) => c.index);
        expect(indices).toEqual([...Array(result.length).keys()].map((i) => i + 1));
        expect(new Set(indices).size).toBe(result.length);
        expect(result.every((c) => c.used === false)).toBe(true);
      }),
    );
  });

  it("dedupes by source_url + label, never exceeding seed count", () => {
    fc.assert(
      fc.property(fc.array(arbSeed, { maxLength: 30 }), (seeds) => {
        const result = allocateCitations(seeds);
        const keys = new Set<string>();
        const seen = new Set<string>();
        for (const c of result) {
          const k = `${c.source_url ?? ""}\u0000${c.label}`;
          expect(keys.has(k)).toBe(false);
          keys.add(k);
        }
        for (const s of seeds) {
          const k = `${s.source_url ?? ""}\u0000${s.label}`;
          seen.add(k);
        }
        expect(result.length).toBeLessThanOrEqual(seeds.length);
        expect(result.length).toBe(seen.size);
      }),
    );
  });
});

describe("extractors — Property 19, Source-url honesty", () => {
  const arbUrlSlot = fc.oneof(fc.constant(""), fc.constant(null), fc.constant(undefined), fc.webUrl());

  it("search_ubc_pages never emits an empty source_url", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            source: fc.string({ minLength: 1 }),
            title: fc.string({ minLength: 1, maxLength: 40 }),
            url: arbUrlSlot,
            text: fc.string(),
            date: fc.option(fc.string()),
          }),
          { maxLength: 8 },
        ),
        (pages) => {
          const seeds = extract("search_ubc_pages")({ pages }, {});
          for (const s of seeds) {
            expect(s.source_url).not.toBe("");
          }
        },
      ),
    );
  });

  it("find_events never emits an empty source_url", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1 }),
            title: fc.string({ minLength: 1, maxLength: 40 }),
            text: fc.string(),
            url: arbUrlSlot,
            start_date: fc.option(fc.string()),
            end_date: fc.option(fc.string()),
            all_day: fc.boolean(),
            venue: fc.option(fc.string()),
            venue_address: fc.option(fc.string()),
            categories: fc.array(fc.string()),
          }),
          { maxLength: 8 },
        ),
        (events) => {
          const seeds = extract("find_events")({ events }, {});
          for (const s of seeds) expect(s.source_url).not.toBe("");
        },
      ),
    );
  });

  it("get_key_dates never emits an empty source_url", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: fc.constantFrom("academic", "holiday"),
            name: fc.string({ minLength: 1, maxLength: 40 }),
            applies_to: fc.option(fc.string()),
            date_text: fc.option(fc.string()),
            start: fc.option(fc.string()),
            end: fc.option(fc.string()),
            ubc_specific: fc.option(fc.boolean()),
            source_url: arbUrlSlot,
          }),
          { maxLength: 8 },
        ),
        (dates) => {
          const seeds = extract("get_key_dates")({ dates }, {});
          for (const s of seeds) expect(s.source_url).not.toBe("");
        },
      ),
    );
  });

  it("find_programs never emits an empty source_url", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1 }),
            name: fc.string({ minLength: 1, maxLength: 40 }),
            summary: fc.string(),
            url: arbUrlSlot,
            degrees: fc.array(fc.string()),
            interests: fc.array(fc.string()),
            duration: fc.option(fc.string()),
            requirement_key: fc.option(fc.string()),
            note: fc.option(fc.string()),
          }),
          { maxLength: 8 },
        ),
        (programs) => {
          const seeds = extract("find_programs")({ programs }, {});
          for (const s of seeds) expect(s.source_url).not.toBe("");
        },
      ),
    );
  });

  it.each(["javascript:alert(1)", "data:text/html,example", "file:///tmp/example", "https://user:secret@example.test"])(
    "omits unsafe source links: %s",
    (url) => {
      const seeds = extract("search_ubc_pages")({ pages: [{ title: "Example", url }] }, {});
      expect(seeds[0].source_url).toBeUndefined();
    },
  );

  it("keeps Documents topic and timestamps through search and full-article citation extraction", () => {
    const article = {
      title: "Example procedure",
      category: "documents",
      subcategory: "workday",
      source_url: "https://example.test/procedure",
      source_modified_at: "2026-08-01T12:00:00Z",
      retrieved_at: "2026-09-01T12:00:00Z",
    };
    const full = extract("get_document")(article, {});
    const found = extract("search_ubc_pages")(
      { pages: [{ ...article, url: article.source_url, date: article.source_modified_at }] },
      {},
    );
    for (const seed of [...full, ...found])
      expect(seed).toMatchObject({
        kind: "documents",
        source_url: article.source_url,
        detail: {
          category: "documents",
          subcategory: "workday",
          retrieved_at: article.retrieved_at,
          source_modified_at: article.source_modified_at,
        },
      });
  });

  it("retains public resource retrieval and publisher timestamps", () => {
    const seeds = extract("search_student_resources")(
      {
        resources: [
          {
            title: "Example resource",
            category: "student-support",
            source_url: "https://example.test/resource",
            retrieved_at: "2026-09-01T12:00:00Z",
            source_modified_at: "2026-08-01T12:00:00Z",
          },
        ],
      },
      {},
    );
    expect(seeds).toEqual([
      expect.objectContaining({
        label: "Example resource",
        tool: "search_student_resources",
        source_url: "https://example.test/resource",
        detail: expect.objectContaining({
          category: "student-support",
          retrieved_at: "2026-09-01T12:00:00Z",
          source_modified_at: "2026-08-01T12:00:00Z",
        }),
      }),
    ]);
  });

  it("keeps housing source conditions with each fee citation", () => {
    const seeds = extract("get_costs")(
      {
        kind: "housing",
        fee_tables: [
          {
            title: "Example fees",
            source_url: "https://example.test/fees",
            source_context_required: true,
            retrieved_at: "2026-09-01T12:00:00Z",
            source_modified_at: "2026-08-01T12:00:00Z",
          },
        ],
      },
      {},
    );
    expect(seeds[0]).toMatchObject({
      label: "Example fees",
      source_url: "https://example.test/fees",
      tool: "get_costs",
      detail: { retrieved_at: "2026-09-01T12:00:00Z", source_context_required: true },
    });
    expect(extract("get_costs")({ kind: "living", living_costs: [] }, {})).toEqual([]);
  });

  it("attributes library schedules to their dated source snapshot", () => {
    const seeds = extract("get_library_hours")(
      {
        date: "2026-09-05",
        branches: [
          {
            title: "Example library",
            source_url: "https://example.test/library",
            retrieved_at: "2026-08-01T12:00:00Z",
            scheduled: {
              date: "2026-09-05",
              source_url: "https://example.test/hours",
              retrieved_at: "2026-09-01T12:00:00Z",
            },
          },
        ],
      },
      {},
    );
    expect(seeds[0]).toMatchObject({
      label: "Example library",
      source_url: "https://example.test/hours",
      tool: "get_library_hours",
      detail: { date: "2026-09-05", retrieved_at: "2026-09-01T12:00:00Z" },
    });
  });

  it("course extractors omit source_url entirely (no URL field on records)", () => {
    const doc: CourseDoc = {
      code: "CPSC_V 110",
      subject: "CPSC_V",
      number: "110",
      title: "Computation, Programs, and Programming",
      description: "",
      credits: 4,
      prerequisite: null,
      corequisite: null,
      sections: [],
      terms: [],
    };
    const courseSeeds = extract("get_course")(doc, {});
    const searchSeeds = extract("find_courses")({ courses: [doc] }, {});
    for (const s of [...courseSeeds, ...searchSeeds]) {
      expect(s.kind).toBe("course");
      expect(s.tool).toMatch(/get_course|find_courses/);
      expect("source_url" in s).toBe(false);
      expect(s.detail?.subject).toBe("CPSC");
      expect(s.detail?.number).toBe("110");
    }
    expect(courseSeeds[0].label).toBe("CPSC 110 \u2014 Computation, Programs, and Programming");
  });
});

describe("stampUsed — Property 20, Used-only-after-stamp", () => {
  it.each(["[1,2]", "[1, 2]", "[ 1 , 2 ]", "[2, 1, 2]"])(
    "marks sources referenced by grouped citations: %s",
    (marker) => {
      const citations: Citation[] = [1, 2, 3].map((index) => ({
        index,
        label: `Source ${index}`,
        kind: "page",
        tool: "get_library_hours",
        used: false,
      }));
      const stamped = stampUsed(citations, `The schedule is unknown ${marker}.`);
      expect(stamped.map((citation) => citation.used)).toEqual([true, true, false]);
      expect(citations.every((citation) => !citation.used)).toBe(true);
      expect(stamped[2]).toBe(citations[2]);
    },
  );

  it("ignores invalid grouped references while retaining valid source indices", () => {
    const citations: Citation[] = [1, 2].map((index) => ({
      index,
      label: `Source ${index}`,
      kind: "page",
      tool: "get_library_hours",
      used: false,
    }));
    expect(stampUsed(citations, "Read [1, 0, 99, 9007199254740993].").map((citation) => citation.used)).toEqual([
      true,
      false,
    ]);
    expect(stampUsed(citations, "[1, x] [1-2] [1, 2")).toBe(citations);
  });

  it("live (pre-stamp) citations carry used false; stamping sets used only for indices present in text", () => {
    fc.assert(
      fc.property(fc.array(arbSeed, { maxLength: 8 }), arbTextWithMarkers, (seeds, text) => {
        const citations = allocateCitations(seeds);
        expect(citations.every((c) => c.used === false)).toBe(true);
        const stamped = stampUsed(citations, text);
        for (const c of stamped) {
          const expectedUsed = text.includes(`[${c.index}]`);
          expect(c.used).toBe(expectedUsed);
        }
        for (let i = 0; i < stamped.length; i++) {
          if (!text.includes(`[${i + 1}]`)) expect(stamped[i].used).toBe(false);
        }
      }),
    );
  });

  it("does not mutate the input", () => {
    const citations: Citation[] = [
      { index: 1, label: "A", kind: "page", used: false, tool: "search_ubc_pages" },
      { index: 2, label: "B", kind: "page", used: false, tool: "search_ubc_pages" },
    ];
    stampUsed(citations, "Refer to [1] only");
    expect(citations[0].used).toBe(false);
    expect(citations[1].used).toBe(false);
  });

  it("returns the input by reference when no markers match", () => {
    const citations: Citation[] = [{ index: 1, label: "A", kind: "page", used: false, tool: "search_ubc_pages" }];
    expect(stampUsed(citations, "no markers here")).toBe(citations);
  });

  it("empty citations array passes through", () => {
    expect(stampUsed([], "text [1]")).toEqual([]);
  });
});
