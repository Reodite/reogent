import type { Citation, CitationKind } from "@/src/shared/citations/citation";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendExchange, canWriteSession, deleteSession, updateSessionTitle } from "./store";

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

describe("session write ownership", () => {
  beforeEach(() => queryMock.mockReset());

  it("refuses a denied upsert without a separate message insert", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(appendExchange("attacker", "sid", "q", "a")).rejects.toThrow("Session not found");

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toMatch(/WHERE sessions\.user_id = \$2\s+RETURNING id/);
    expect(sql).toMatch(/INSERT INTO messages[\s\S]+FROM owned_session/);
  });

  it("writes a paired exchange through the new or owned session gate", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 2 });
    const activity = [{ type: "thinking" as const, content: "Looking up courses" }];
    const citations: Citation[] = [{ index: 1, label: "CPSC 110", kind: "course", used: true, tool: "search" }];
    const question = "q".repeat(90);

    await appendExchange("u1", "sid", question, "answer", activity, citations);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/WITH owned_session AS/);
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE SET updated_at = now\(\)/);
    expect(sql).toMatch(/WHERE sessions\.user_id = \$2\s+RETURNING id/);
    expect(sql).toMatch(/\(0, 'user', \$4::text, NULL::jsonb, NULL::jsonb\)/);
    expect(sql).toMatch(/\(1, 'assistant', \$5::text, \$6::jsonb, \$7::jsonb\)/);
    expect(sql).toMatch(/FROM owned_session[\s\S]+ORDER BY exchange\.position/);
    expect(params).toEqual([
      "sid",
      "u1",
      question.slice(0, 80),
      question,
      "answer",
      JSON.stringify(activity),
      JSON.stringify(citations),
    ]);
  });

  it.each([
    { rows: [], allowed: true },
    { rows: [{ user_id: "u1" }], allowed: true },
    { rows: [{ user_id: "someone-else" }], allowed: false },
  ])("preflights ownership without message history: $allowed, $rows", async ({ rows, allowed }) => {
    queryMock.mockResolvedValue({ rows });

    await expect(canWriteSession("u1", "sid")).resolves.toBe(allowed);
    expect(queryMock).toHaveBeenCalledExactlyOnceWith("SELECT user_id FROM sessions WHERE id = $1", ["sid"]);
  });

  it("checks read ownership in the same query as the message data", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ role: null }] });
    await expect(getSessionMessages("u1", "sid")).resolves.toEqual([]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toMatch(/LEFT JOIN messages[\s\S]+WHERE s.id = \$1 AND s.user_id = \$2/);
    expect(queryMock.mock.calls[0][1]).toEqual(["sid", "u1"]);
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(getSessionMessages("attacker", "sid")).resolves.toBeNull();
  });

  it("deletes messages only through the ownership-checked cascade", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });
    await expect(deleteSession("u1", "sid")).resolves.toBe(true);
    expect(queryMock).toHaveBeenCalledExactlyOnceWith("DELETE FROM sessions WHERE id = $1 AND user_id = $2", [
      "sid",
      "u1",
    ]);
  });

  it("scopes generated titles to the authenticated owner", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });

    await updateSessionTitle("u1", "sid", "Title");

    expect(queryMock).toHaveBeenCalledExactlyOnceWith("UPDATE sessions SET title = $2 WHERE id = $1 AND user_id = $3", [
      "sid",
      "Title",
      "u1",
    ]);
  });
});

describe("16.4 Property 21 — History rehydration byte-equality", () => {
  it("for any JSONB citations cell, the deserialized message byte-equals the original", async () => {
    await fc.assert(
      fc.asyncProperty(arbPersistedMessage, async ({ rawJson, parsed }) => {
        queryMock.mockReset();
        queryMock.mockResolvedValueOnce({
          rows: [
            {
              role: "assistant",
              content: "answer",
              activity: null,
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
    queryMock.mockReset().mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("INSERT INTO messages")) {
        captured = params[params.length - 1] as string | null;
        return { rows: [], rowCount: 2 };
      }
      return { rows: [{ id: "sid" }] };
    });
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
    await appendExchange("u1", "sid", "q", "a", [], live);

    queryMock.mockReset();
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          role: "assistant",
          content: "a",
          activity: null,
          citations: captured === null ? null : JSON.parse(captured),
        },
      ],
    });
    const msgs = await getSessionMessages("u1", "sid");
    expect(msgs[0].citations).toEqual(live);
    expect(JSON.stringify(msgs[0].citations)).toEqual(JSON.stringify(live));
  });

  it("empty citations array persists as null (client treats null and [] identically)", async () => {
    await appendExchange("u1", "sid", "q", "a", [], []);

    expect(captured).toBeNull();
  });

  it("null citations pass through and reload as null", async () => {
    await appendExchange("u1", "sid", "q", "a", [], null);

    expect(captured).toBeNull();
    queryMock.mockReset();
    queryMock.mockResolvedValueOnce({
      rows: [{ role: "assistant", content: "a", activity: null, citations: null }],
    });
    const msgs = await getSessionMessages("u1", "sid");
    expect(JSON.stringify(msgs[0].citations)).toEqual("null");
  });
});
