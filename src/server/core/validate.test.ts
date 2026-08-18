import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateChatRequest } from "./validate";

const validMessage = fc.record({
  role: fc.constantFrom("user" as const, "assistant" as const),
  content: fc.string(),
});

describe("chat request validation", () => {
  // Feature: reodite, Property 5: Request validation
  it("Property 5: rejects missing/empty messages, accepts non-empty role/content pairs", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // invalid: anything without a usable messages array
          fc
            .anything()
            .filter(
              (b) =>
                typeof b !== "object" ||
                b === null ||
                Array.isArray(b) ||
                !Array.isArray((b as Record<string, unknown>).messages) ||
                ((b as Record<string, unknown>).messages as unknown[]).length === 0,
            )
            .map((body) => ({ body, valid: false })),
          // valid: non-empty array of role/content pairs
          fc
            .record({
              session_id: fc.option(fc.uuid(), { nil: undefined }),
              messages: fc.array(validMessage, { minLength: 1, maxLength: 10 }),
            })
            .map((body) => ({ body, valid: true })),
        ),
        ({ body, valid }) => {
          const result = validateChatRequest(body);
          expect(result.ok).toBe(valid);
          if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("rejects malformed message entries", () => {
    expect(validateChatRequest({ messages: [{ role: "system", content: "x" }] }).ok).toBe(false);
    expect(validateChatRequest({ messages: [{ role: "user", content: 5 }] }).ok).toBe(false);
    expect(validateChatRequest({ messages: [{ role: "user", content: "hi" }], session_id: 7 }).ok).toBe(false);
  });

  it("rejects when message count exceeds 100", () => {
    const messages = Array.from({ length: 101 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "x",
    }));
    const result = validateChatRequest({ messages });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("100");
  });

  it("accepts exactly 100 messages", () => {
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "x",
    }));
    expect(validateChatRequest({ messages }).ok).toBe(true);
  });

  it("rejects message content exceeding 32000 characters", () => {
    const longContent = "x".repeat(32_001);
    const result = validateChatRequest({ messages: [{ role: "user", content: longContent }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("32000");
  });

  it("accepts message content at exactly 32000 characters", () => {
    const content = "x".repeat(32_000);
    expect(validateChatRequest({ messages: [{ role: "user", content }] }).ok).toBe(true);
  });

  it("rejects session_id that is not a valid UUID", () => {
    expect(validateChatRequest({ messages: [{ role: "user", content: "hi" }], session_id: "not-a-uuid" }).ok).toBe(
      false,
    );
    expect(validateChatRequest({ messages: [{ role: "user", content: "hi" }], session_id: "a".repeat(65) }).ok).toBe(
      false,
    );
  });

  it("accepts a valid UUID session_id", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(validateChatRequest({ messages: [{ role: "user", content: "hi" }], session_id: uuid }).ok).toBe(true);
  });
});
