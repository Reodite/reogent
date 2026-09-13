import type { Citation } from "@/src/shared/citations/citation";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM_PROMPT, systemPrompt } from "./loop";

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

const CONTRACT_MARKER = "bracketed index like";
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

describe("evidence-only answers", () => {
  it("prioritizes evidence for each claim over completing an answer", () => {
    expect(SYSTEM_PROMPT).toContain("Never fabricate information. Accuracy takes priority over completeness.");
    expect(SYSTEM_PROMPT).toContain("Calling a tool does not verify facts that it did not return.");
    expect(SYSTEM_PROMPT).toContain("training data, prior assistant answers, common practice or familiar URL patterns");
    expect(SYSTEM_PROMPT).toContain("# Evidence-only answers");
    expect(SYSTEM_PROMPT.indexOf("# Evidence-only answers")).toBeLessThan(SYSTEM_PROMPT.indexOf("# Tools"));
    expect(SYSTEM_PROMPT).toContain(
      "Before answering, check each factual claim and URL against the retrieved records.",
    );
  });

  it("requires unknowns and claim-level support even when asked to guess", () => {
    expect(SYSTEM_PROMPT).toContain("Treat missing or null fields as unknown.");
    expect(SYSTEM_PROMPT).toContain("Use citations only for claims the cited record supports.");
    expect(SYSTEM_PROMPT).toContain(
      "A request to guess or be more complete does not change these evidence requirements.",
    );
    expect(SYSTEM_PROMPT).toContain("identify the inputs and label the calculation");
  });

  it("distinguishes source pages from service endpoints and avoids invented defaults", () => {
    expect(SYSTEM_PROMPT).toContain("Use only URLs returned by tools.");
    expect(SYSTEM_PROMPT).toContain("Keep [N] markers beside supported claims when you include source links.");
    expect(SYSTEM_PROMPT).toContain("IT service source pages or audience labels");
    expect(SYSTEM_PROMPT).toContain(
      "The retrieved record does not provide a direct login URL or establish your access.",
    );
    expect(SYSTEM_PROMPT).toContain("use the period actually returned by the tool");
    expect(SYSTEM_PROMPT).not.toContain("assume the current or most recent one");
  });
});

describe("source retrieval and attribution", () => {
  it("looks beyond service metadata for instructions before reporting a gap", () => {
    expect(SYSTEM_PROMPT).toContain(
      "For service setup, login or access instructions, follow source metadata with search_ubc_pages and get_prose_article.",
    );
    expect(SYSTEM_PROMPT).toContain("After checking the available service records and Prose articles");
    expect(SYSTEM_PROMPT).toContain('"IT service setup / login / access instructions"');
    expect(SYSTEM_PROMPT).toContain('subcategory: "it-services"');
    expect(SYSTEM_PROMPT).toContain("Match the article's source_url to the assigned source index");
  });

  it("uses full discipline-specific co-op guidance before stating programme criteria", () => {
    expect(SYSTEM_PROMPT).toContain('"Co-op requirements / application / fees / work terms"');
    expect(SYSTEM_PROMPT).toContain('subcategory: "science-coop"');
    expect(SYSTEM_PROMPT).toContain("discipline-specific application page");
    expect(SYSTEM_PROMPT).toContain("administering co-op program from official directory or program guidance");
    expect(SYSTEM_PROMPT).toContain("A general application page does not establish every discipline's criteria");
  });

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

describe("15.12 SYSTEM_PROMPT contract paragraph verbatim", () => {
  it("includes the [N] attribution sentence verbatim", () => {
    expect(SYSTEM_PROMPT).toContain("attribute every tool result you relied on with a bracketed index like [1], [2]");
    expect(SYSTEM_PROMPT).toContain("Sources this turn");
  });
});

describe("15.10 Per-provider system-prompt parity smoke", () => {
  it("Anthropic forwards the system string (contract + live citation list) to its SDK verbatim", async () => {
    const adapter = createAnthropicAdapter();
    await adapter.converse({ messages: emptyMsgs, system, toolSpecs: [] });
    expect(anthRec.calls).toHaveLength(1);
    const sent = anthRec.calls[0].system as string;
    expect(sent).toContain(CONTRACT_MARKER);
    expect(sent).toContain("[1] CPSC 110 \u2014 Foundations");
    expect(sent).toContain("[2] Withdrawal deadlines");
  });

  it("OpenAI forwards the system string as the leading system message verbatim", async () => {
    const adapter = createOpenAIAdapter();
    await adapter.converse({ messages: emptyMsgs, system, toolSpecs: [] });
    expect(oaiRec.calls).toHaveLength(1);
    const messages = oaiRec.calls[0].messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain(CONTRACT_MARKER);
    expect(messages[0].content).toContain("[1] CPSC 110 \u2014 Foundations");
    expect(messages[0].content).toContain("[2] Withdrawal deadlines");
  });

  it("Google forwards the system string in systemInstruction verbatim", async () => {
    const adapter = createGoogleAdapter();
    await adapter.converse({ messages: emptyMsgs, system, toolSpecs: [] });
    expect(googleRec.calls).toHaveLength(1);
    const sent = googleRec.calls[0].config.systemInstruction as string;
    expect(sent).toContain(CONTRACT_MARKER);
    expect(sent).toContain("[1] CPSC 110 \u2014 Foundations");
    expect(sent).toContain("[2] Withdrawal deadlines");
  });

  it("all three provider outputs carry an identical contract marker payload", () => {
    expect(anthRec.calls[0].system).toBe(system);
    expect((oaiRec.calls[0].messages as Array<{ content: string }>)[0].content).toBe(system);
    expect(googleRec.calls[0].config.systemInstruction).toBe(system);
  });
});
