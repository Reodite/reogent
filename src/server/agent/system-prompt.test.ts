import type { Citation } from "@/src/shared/citations/citation";
import { describe, expect, it, vi } from "vitest";
import { systemPrompt } from "./loop";

const CITATIONS: Citation[] = [
  {
    index: 1,
    label: "CPSC 110 \u2014 Foundations",
    kind: "course",
    used: false,
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

const emptyMsgs = [{ role: "user" as const, content: [{ text: "hi" }] }];

const anthRec = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
const oaiRec = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
const googleRec = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      async create(req: Record<string, unknown>) {
        anthRec.calls.push(req);
        return { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" };
      },
    };
  },
}));

vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        async create(req: Record<string, unknown>) {
          oaiRec.calls.push(req);
          return { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] };
        },
      },
    };
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      async generateContent(req: Record<string, unknown>) {
        googleRec.calls.push(req);
        return { candidates: [{ content: { parts: [{ text: "ok" }] } }] };
      },
    };
  },
}));

const { createAnthropicAdapter } = await import("../llm/anthropic");
const { createOpenAIAdapter } = await import("../llm/openai");
const { createGoogleAdapter } = await import("../llm/google");

process.env.LLM_API_KEY ??= "test-key";

const system = systemPrompt(new Date("2026-08-18T00:00:00Z"), CITATIONS);

describe("student profile paragraph", () => {
  const MARKER = "The student's profile:";

  it("lists only the fields that are set", () => {
    expect(
      systemPrompt(new Date(), [], { program: "Computer Science", year: 3, student_type: "international" }),
    ).toContain(`${MARKER} program Computer Science, year 3, international student.`);
    expect(systemPrompt(new Date(), [], { student_type: "domestic" })).toContain(`${MARKER} domestic student.`);
  });

  it("is omitted for an empty or missing profile", () => {
    expect(systemPrompt(new Date(), [], {})).not.toContain(MARKER);
    expect(systemPrompt(new Date(), [], null)).not.toContain(MARKER);
    expect(system).not.toContain(MARKER);
  });
});

describe("source retrieval and attribution", () => {
  it("keeps identically named sources tied to their URLs and assigned indices", () => {
    const prompt = systemPrompt(new Date("2026-08-18T00:00:00Z"), [
      CITATIONS[0],
      { ...CITATIONS[1], label: "Example policy", source_url: "https://example.test/bfa/policy" },
      { ...CITATIONS[1], index: 3, label: "Example policy", source_url: "https://example.test/ba/policy" },
    ]);
    expect(prompt).toContain("[1] CPSC 110 \u2014 Foundations\n");
    expect(prompt).toContain("[2] Example policy (https://example.test/bfa/policy)");
    expect(prompt).toContain("[3] Example policy (https://example.test/ba/policy)");
  });
});

describe("15.10 Per-provider system-prompt parity smoke", () => {
  it("Anthropic forwards the system string (contract + live citation list) to its SDK verbatim", async () => {
    const adapter = createAnthropicAdapter();
    await adapter.converse({ messages: emptyMsgs, system, toolSpecs: [] });
    expect(anthRec.calls).toHaveLength(1);
    const sent = anthRec.calls[0].system as string;
    expect(sent).toBe(system);
  });

  it("OpenAI forwards the system string as the leading system message verbatim", async () => {
    const adapter = createOpenAIAdapter();
    await adapter.converse({ messages: emptyMsgs, system, toolSpecs: [] });
    expect(oaiRec.calls).toHaveLength(1);
    const messages = oaiRec.calls[0].messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe(system);
  });

  it("Google forwards the system string in systemInstruction verbatim", async () => {
    const adapter = createGoogleAdapter();
    await adapter.converse({ messages: emptyMsgs, system, toolSpecs: [] });
    expect(googleRec.calls).toHaveLength(1);
    const sent = googleRec.calls[0].config.systemInstruction as string;
    expect(sent).toBe(system);
  });
});
