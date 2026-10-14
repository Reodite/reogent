import type { Citation } from "@/src/shared/citations/citation";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const anthRec = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  options: [] as Array<{ signal?: AbortSignal } | undefined>,
}));
const oaiRec = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  options: [] as Array<{ signal?: AbortSignal } | undefined>,
  onStreamEnd: undefined as (() => void) | undefined,
}));
const googleRec = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      async create(req: Record<string, unknown>, options?: { signal?: AbortSignal }) {
        anthRec.calls.push(req);
        anthRec.options.push(options);
        return { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" };
      },
      stream(req: Record<string, unknown>, options?: { signal?: AbortSignal }) {
        anthRec.calls.push(req);
        anthRec.options.push(options);
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "content_block_delta", delta: { type: "text_delta", text: "ok" } };
            yield { type: "message_stop" };
          },
          async finalMessage() {
            return { stop_reason: "end_turn" };
          },
        };
      },
    };
  },
}));

vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        async create(req: Record<string, unknown>, options?: { signal?: AbortSignal }) {
          oaiRec.calls.push(req);
          oaiRec.options.push(options);
          if (req.stream) {
            return (async function* () {
              yield { choices: [{ delta: { content: "ok" } }] };
              if (oaiRec.onStreamEnd) {
                oaiRec.onStreamEnd();
                return;
              }
              yield { choices: [{ delta: {}, finish_reason: "stop" }] };
            })();
          }
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
      async generateContentStream(req: Record<string, unknown>) {
        googleRec.calls.push(req);
        return (async function* () {
          yield { candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] };
        })();
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

  it("includes the preferred name without adding account settings", () => {
    const prompt = systemPrompt(new Date(), [], { preferred_name: "Sam", theme: "dark", onboarding_completed: true });
    expect(prompt).toContain('preferred name "Sam"');
    expect(prompt).not.toContain("onboarding_completed");
  });

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

describe("per-provider SDK forwarding", () => {
  beforeEach(() => {
    anthRec.calls.length = 0;
    anthRec.options.length = 0;
    oaiRec.calls.length = 0;
    oaiRec.options.length = 0;
    oaiRec.onStreamEnd = undefined;
    googleRec.calls.length = 0;
  });

  it.each(["converse", "converseStream"] as const)(
    "Anthropic %s forwards the system string and request signal",
    async (method) => {
      const adapter = createAnthropicAdapter();
      const { signal } = new AbortController();
      const req = { messages: emptyMsgs, system, toolSpecs: [], signal };
      if (method === "converseStream") await Array.fromAsync(adapter.converseStream(req));
      else await adapter.converse(req);
      expect(anthRec.calls).toHaveLength(1);
      expect(anthRec.calls[0].system).toBe(system);
      expect(anthRec.options[0]?.signal).toBe(signal);
    },
  );

  it.each(["converse", "converseStream"] as const)(
    "OpenAI %s forwards the leading system message and request signal",
    async (method) => {
      const adapter = createOpenAIAdapter();
      const { signal } = new AbortController();
      const req = { messages: emptyMsgs, system, toolSpecs: [], signal };
      if (method === "converseStream") await Array.fromAsync(adapter.converseStream(req));
      else await adapter.converse(req);
      expect(oaiRec.calls).toHaveLength(1);
      const messages = oaiRec.calls[0].messages as Array<{ role: string; content: string }>;
      expect(messages[0]).toEqual({ role: "system", content: system });
      expect(oaiRec.options[0]?.signal).toBe(signal);
    },
  );

  it.each(["converse", "converseStream"] as const)(
    "Google %s forwards systemInstruction and request cancellation",
    async (method) => {
      const adapter = createGoogleAdapter();
      const controller = new AbortController();
      const req = { messages: emptyMsgs, system, toolSpecs: [], signal: controller.signal };
      const stream = method === "converseStream" ? adapter.converseStream(req) : undefined;
      if (stream) await stream.next();
      else await adapter.converse(req);
      expect(googleRec.calls).toHaveLength(1);
      const config = googleRec.calls[0].config as { systemInstruction: string; abortSignal?: AbortSignal };
      expect(config.systemInstruction).toBe(system);
      expect(config.abortSignal?.aborted).toBe(false);
      controller.abort();
      expect(config.abortSignal?.aborted).toBe(true);
      if (stream) await stream.return();
    },
  );

  it("preserves assistant text and tool calls when sending OpenAI history", async () => {
    await createOpenAIAdapter().converse({
      system,
      toolSpecs: [],
      messages: [
        ...emptyMsgs,
        {
          role: "assistant",
          content: [
            { text: "Checking " },
            { toolUse: { toolUseId: "call-1", name: "get_course", input: { course_code: "CPSC 110" } } },
            { text: "the course." },
          ],
        },
        { role: "user", content: [{ toolResult: { toolUseId: "call-1", content: [{ json: { credits: 4 } }] } }] },
      ],
    });
    expect(oaiRec.calls[0].messages).toEqual([
      { role: "system", content: system },
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "Checking the course.",
        tool_calls: [
          { id: "call-1", type: "function", function: { name: "get_course", arguments: '{"course_code":"CPSC 110"}' } },
        ],
      },
      { role: "tool", tool_call_id: "call-1", content: '[{"credits":4}]' },
    ]);
  });

  it("rejects caller cancellation when OpenAI swallows the abort as EOF", async () => {
    const controller = new AbortController();
    const reason = new Error("Caller cancelled");
    oaiRec.onStreamEnd = () => controller.abort(reason);
    const stream = createOpenAIAdapter().converseStream({
      messages: emptyMsgs,
      system,
      toolSpecs: [],
      signal: controller.signal,
    });
    expect((await stream.next()).value).toEqual({ type: "text", delta: "ok" });
    await expect(stream.next()).rejects.toBe(reason);
  });
});
