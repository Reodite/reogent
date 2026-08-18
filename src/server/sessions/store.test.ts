import type { Citation, CitationKind } from "@/src/shared/citations/citation";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendExchange } from "./store";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ getPool: () => ({ query: queryMock }) }));

const { getSessionMessages } = await import("./store");

const arbKind: fc.Arbitrary<CitationKind> = fc.constantFrom(
  "course",
  "program",
  "event",
  "calendar",
  "page",
  "generic",
);

const stampIndices = (arr: Omit<Citation, "index">[]): Citation[] => arr.map((c, i) => ({ ...c, index: i + 1 }));

const arbCitation: fc.Arbitrary<Omit<Citation, "index">> = fc.record({
  label: fc.string({ minLength: 1, maxLength: 40 }),
  kind: arbKind,
  source_url: fc.option(fc.webUrl()),
  used: fc.boolean(),
  tool: fc.string({ minLength: 1, maxLength: 20 }),
  detail: fc.option(
    fc.record({
      subject: fc.option(fc.string({ minLength: 1 })),
      number: fc.option(fc.string({ minLength: 1 })),
      date: fc.option(fc.string({ minLength: 1 })),
    }),
  ),
});

/** Models a persisted row: `rawJson` is the JSONB cell, `parsed` is the loadHistory value. */
const arbPersistedMessage = fc
  .oneof(fc.constant(null), fc.array(arbCitation, { maxLength: 8 }).map(stampIndices))
  .map((arr) => ({
    rawJson: arr === null ? "null" : JSON.stringify(arr),
    parsed: arr,
  }));

describe("16.4 Property 21 — History rehydration byte-equality", () => {
  it("for any JSONB citations cell, the deserialized message byte-equals the original", async () => {
    await fc.assert(
      fc.asyncProperty(arbPersistedMessage, async ({ rawJson, parsed }) => {
        queryMock.mockReset();
        queryMock.mockResolvedValueOnce({ rows: [{ id: "sid" }] });
        queryMock.mockResolvedValueOnce({
          rows: [
            {
              role: "assistant",
              content: "answer",
              tool_calls: null,
              interstitial: null,
              citations: JSON.parse(rawJson),
            },
          ],
        });
        const msgs = await getSessionMessages("u1", "sid");
        expect(msgs).toHaveLength(1);
        // Byte-equality oracle: no `?? []` normalization; 'null' === 'null' for the null branch.
        expect(JSON.stringify(JSON.parse(rawJson))).toEqual(JSON.stringify(msgs[0].citations));
        expect(msgs[0].citations).toEqual(parsed);
        if (Array.isArray(parsed)) {
          // Property 18 holds through the load path: indices form 1..length.
          expect(msgs[0]?.citations?.map((c) => c.index)).toEqual([...(parsed ?? []).keys()].map((i) => i + 1));
          if (parsed.length === 0) {
            // Empty arrays reload identically — our persistence stores null only when [] was written.
          }
        }
      }),
    );
  });
});

describe("16.3 Integration — appendExchange → getSessionMessages round-trip", () => {
  let captured: string | null = null;

  beforeEach(() => {
    captured = null;
    queryMock.mockReset();
  });

  it("persisted stamped array rehydrates byte-identical", async () => {
    const live: Citation[] = [
      {
        index: 1,
        label: "CPSC 110 \u2014 Foundations",
        kind: "course",
        used: true,
        tool: "get_course",
        detail: { subject: "CPSC", number: "110" },
      },
      {
        index: 2,
        label: "Withdrawal deadlines",
        kind: "calendar",
        used: false,
        tool: "get_key_dates",
        source_url: "https://www.calendar.ubc.ca/",
      },
    ];
    queryMock.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.startsWith("INSERT INTO sessions")) return { rows: [] };
      if (sql.startsWith("INSERT INTO messages")) {
        captured = params[params.length - 1] as string | null;
        return { rows: [] };
      }
      return { rows: [{ id: "sid" }] };
    });

    await appendExchange("u1", "sid", "q", "a", [], [], live);

    queryMock.mockReset();
    queryMock.mockResolvedValueOnce({ rows: [{ id: "sid" }] });
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          role: "assistant",
          content: "a",
          tool_calls: null,
          interstitial: null,
          citations: captured === null ? null : JSON.parse(captured),
        },
      ],
    });
    const msgs = await getSessionMessages("u1", "sid");
    expect(msgs[0].citations).toEqual(live);
    expect(JSON.stringify(msgs[0].citations)).toEqual(JSON.stringify(live));
  });

  it("empty citations array persists as null (client treats null and [] identically)", async () => {
    queryMock.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.startsWith("INSERT INTO sessions")) return { rows: [] };
      if (sql.startsWith("INSERT INTO messages")) {
        captured = params[params.length - 1] as string | null;
        return { rows: [] };
      }
      return { rows: [{ id: "sid" }] };
    });

    await appendExchange("u1", "sid", "q", "a", [], [], []);

    expect(captured).toBeNull();
  });

  it("null citations pass through and reload as null", async () => {
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.startsWith("INSERT INTO sessions")) return { rows: [] };
      if (sql.startsWith("INSERT INTO messages")) {
        captured = params[params.length - 1] as string | null;
        return { rows: [] };
      }
      return { rows: [{ id: "sid" }] };
    });

    await appendExchange("u1", "sid", "q", "a", [], [], null);

    expect(captured).toBeNull();
    queryMock.mockReset();
    queryMock.mockResolvedValueOnce({ rows: [{ id: "sid" }] });
    queryMock.mockResolvedValueOnce({
      rows: [{ role: "assistant", content: "a", tool_calls: null, interstitial: null, citations: null }],
    });
    const msgs = await getSessionMessages("u1", "sid");
    expect(JSON.stringify(msgs[0].citations)).toEqual("null");
  });
});
