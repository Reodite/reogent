import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { DatasetModule, SearchClient } from "../core/types";
import { sanitizeMeiliId } from "../ingest";
import type { LlmAdapter } from "../llm/types";
import { documents, type DocumentDoc } from "../modules/documents";
import { pages } from "../modules/pages";
import { ITERATION_LIMIT } from "./loop";
import { streamAgent } from "./stream";

const llm = vi.hoisted(() => ({ converseStream: vi.fn<LlmAdapter["converseStream"]>() }));
vi.mock("../llm", () => ({ converse: vi.fn(), converseStream: llm.converseStream }));

it("forwards usage for each model turn, including tool calls and the final answer", async () => {
  llm.converseStream
    .mockImplementationOnce(async function* () {
      yield { type: "tool_use", toolUseId: "one", name: "lookup", input: {} };
      yield { type: "usage", totalTokens: 100 };
      yield { type: "stop", reason: "tool_use" };
    })
    .mockImplementationOnce(async function* () {
      yield { type: "text", delta: "Answer" };
      yield { type: "stop", reason: "end_turn" };
      yield { type: "usage", totalTokens: 200 };
    });
  const events = await Array.fromAsync(
    streamAgent([{ role: "user", content: "Find a course" }], {
      modules: [
        {
          name: "test",
          indices: [],
          tools: [
            {
              spec: { name: "lookup", description: "Fixture", inputSchema: { json: {} } },
              execute: async () => ({ found: true }),
            },
          ],
        },
      ],
      search: {} as SearchClient,
    }),
  );
  expect(events.filter((event) => event.type === "usage")).toEqual([
    { type: "usage", totalTokens: 100 },
    { type: "usage", totalTokens: 200 },
  ]);
  expect(events.at(-1)?.type).toBe("done");
});

it("stops a model that ignores tool removal at the hard turn limit", async () => {
  vi.useFakeTimers();
  let turn = 0;
  llm.converseStream.mockImplementation(async function* () {
    if (++turn > ITERATION_LIMIT + 1) throw new Error("Unbounded model calls");
    yield { type: "stop", reason: "tool_use" };
  });
  const events = await Array.fromAsync(
    streamAgent([{ role: "user", content: "test" }], {
      modules: [],
      search: {} as SearchClient,
    }),
  );
  expect(llm.converseStream.mock.calls.length).toBeLessThanOrEqual(ITERATION_LIMIT);
  expect(events.at(-1)).toEqual({ type: "error", message: "Response limit reached. Please ask a narrower question." });
});

it("refuses a tool batch that exceeds the remaining execution budget", async () => {
  vi.useFakeTimers();
  const execute = vi.fn(async () => ({ found: true }));
  llm.converseStream
    .mockImplementation(async function* () {
      yield { type: "text", delta: "Finished" };
      yield { type: "stop", reason: "end_turn" };
    })
    .mockImplementationOnce(async function* () {
      for (let index = 0; index < 7; index++) {
        yield { type: "tool_use", toolUseId: String(index), name: "lookup", input: { index } };
      }
      yield { type: "stop", reason: "tool_use" };
    });
  const events = await Array.fromAsync(
    streamAgent([{ role: "user", content: "test" }], {
      modules: [
        {
          name: "fixture",
          indices: [],
          tools: [{ spec: { name: "lookup", description: "Fixture", inputSchema: { json: {} } }, execute }],
        },
      ],
      search: {} as SearchClient,
    }),
  );
  expect(execute).not.toHaveBeenCalled();
  expect(events.at(-1)?.type).toBe("error");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.resetAllMocks();
});

it("carries the assigned source marker into follow-up page results without changing stored data", async () => {
  vi.useFakeTimers();
  const first = { title: "Example guide", url: "https://example.test/first", source: "calendar", date: null };
  const second = { ...first, url: "https://example.test/second" };
  const followup = { pages: [{ ...second, snippets: ["Confirm your selection."] }] };
  const module: DatasetModule = {
    name: "fixture",
    indices: [],
    tools: [
      {
        spec: { name: "search_ubc_pages", description: "Search fixtures", inputSchema: { json: { type: "object" } } },
        execute: async (input) => (input.query === "second guide" ? followup : { pages: [first, second] }),
      },
    ],
  };
  llm.converseStream
    .mockImplementationOnce(async function* () {
      yield { type: "tool_use", toolUseId: "search", name: "search_ubc_pages", input: { query: "guide" } };
      yield { type: "stop", reason: "tool_use" };
    })
    .mockImplementationOnce(async function* () {
      yield { type: "tool_use", toolUseId: "followup", name: "search_ubc_pages", input: { query: "second guide" } };
      yield { type: "stop", reason: "tool_use" };
    })
    .mockImplementationOnce(async function* () {
      yield { type: "text", delta: "Confirm your selection [2]." };
      yield { type: "stop", reason: "end_turn" };
    });

  const events = await Array.fromAsync(
    streamAgent([{ role: "user", content: "Read the second guide." }], {
      modules: [module],
      search: {} as SearchClient,
    }),
  );
  const response = llm.converseStream.mock.calls[2][0].messages
    .flatMap((message) => message.content)
    .find((block) => block.toolResult?.toolUseId === "followup")?.toolResult;
  expect(response?.content).toEqual([
    { json: followup },
    { json: { source_citations: [{ citation: "[2]", label: second.title, source_url: second.url }] } },
  ]);
  const done = events.find((event) => event.type === "done");
  expect(done?.tool_calls[1].result).toEqual(followup);
  expect(done?.citations.map(({ index, used }) => ({ index, used }))).toEqual([
    { index: 1, used: false },
    { index: 2, used: true },
  ]);
});

it.each(["cited", "uncited", "read-error", "refusal", "widget"])(
  "requires full document reads after a %s draft",
  async (mode) => {
    vi.useFakeTimers();
    const article = {
      original_id: "prose:workday:steps",
      title: "Guide",
      source_url: "https://example.ubc.ca/steps",
      content_markdown: "Confirm your selection. Conditions apply.",
    };
    const execute = vi.fn(async () => {
      if (mode === "read-error") throw new Error("Document unavailable");
      return article;
    });
    const fixture: DatasetModule = {
      name: "fixture",
      indices: [],
      tools: [
        {
          spec: pages.tools[0].spec,
          execute: async () => ({
            pages: [
              {
                ...article,
                original_id: "prose:workday:unrelated",
                source_url: "https://example.ubc.ca/other",
                url: "https://example.ubc.ca/other",
                content_markdown: undefined,
              },
              { ...article, url: article.source_url, content_markdown: undefined },
            ],
          }),
        },
        { spec: documents.tools[0].spec, execute },
        {
          spec: { name: "show_widget", description: "Render a card", inputSchema: { json: {} } },
          execute: async () => ({ kind: "card" }),
        },
      ],
    };
    const answer = async function* () {
      yield { type: "text" as const, delta: "Confirm your selection [2]." };
      yield { type: "stop" as const, reason: "end_turn" };
    };
    llm.converseStream
      .mockImplementation(answer)
      .mockImplementationOnce(async function* () {
        yield { type: "tool_use", toolUseId: "search", name: "search_ubc_pages", input: { query: "guide" } };
        yield { type: "stop", reason: "tool_use" };
      })
      .mockImplementationOnce(async function* () {
        if (mode === "widget") yield { type: "tool_use", toolUseId: "card", name: "show_widget", input: {} };
        yield {
          type: "text",
          delta: mode === "uncited" ? "I could not verify any steps." : "Confirm your selection [2].",
        };
        yield { type: "stop", reason: mode === "widget" ? "tool_use" : "end_turn" };
      })
      .mockImplementationOnce(
        mode === "refusal"
          ? answer
          : async function* () {
              yield {
                type: "tool_use",
                toolUseId: "read",
                name: "get_document",
                input: { article_id: article.original_id },
              };
              yield { type: "stop", reason: "tool_use" };
            },
      );
    const events = await Array.fromAsync(
      streamAgent([{ role: "user", content: "Explain the steps." }], {
        modules: [fixture],
        search: {} as SearchClient,
      }),
    );
    if (mode !== "widget") {
      expect(events).toContainEqual({ type: "text_clear" });
      expect(llm.converseStream.mock.calls[2][0].forceToolUse).toBe(true);
      expect(JSON.stringify(llm.converseStream.mock.calls[2][0].messages)).toContain(
        "Before answering, call get_document",
      );
    }
    if (mode === "read-error" || mode === "refusal") {
      expect(events.some((event) => event.type === "done")).toBe(false);
      expect(events.at(-1)).toEqual({
        type: "error",
        message: "Could not verify the full source documents. Please ask a narrower question.",
      });
    } else {
      const done = events.find((event) => event.type === "done");
      expect(done?.tool_calls.map((tool) => tool.name)).toEqual(
        mode === "widget" ? ["search_ubc_pages", "show_widget", "get_document"] : ["search_ubc_pages", "get_document"],
      );
      expect(done?.citations.find((citation) => citation.index === 2)?.used).toBe(true);
      expect(execute).toHaveBeenCalledTimes(1);
    }
  },
);

it.each(["prose:workday:registration", `documents:official-web:${"b".repeat(24)}`])(
  "reads indexed Markdown and preserves follow-up marker [2] for %s without a widget",
  async (original_id) => {
    vi.useFakeTimers();
    const title = "Registration guide";
    const content_markdown = "# Registration\n\n1. Confirm your selection.\n\nKeep the stated faculty conditions.";
    const article: DocumentDoc = {
      original_id,
      category: "documents",
      subcategory: "workday",
      format: "markdown",
      source_id: "workday",
      upstream_id: "registration",
      title,
      content_markdown,
      content_sha256: createHash("sha256").update(`${title}\n${content_markdown}`).digest("hex"),
      source_url: "https://workday.students.ubc.ca/registration?view=student",
      api_url: null,
      campus: "vancouver",
      audience: "students",
      source_modified_at: "2026-08-01T12:00:00Z",
      retrieved_at: "2026-09-01T12:00:00Z",
      source_records: [],
      links: [],
      warnings: [],
      ...(original_id.startsWith("documents:")
        ? { hostname: "workday.students.ubc.ca", document_category: "support", subcategory: "support" }
        : {}),
    };
    const stored = { id: sanitizeMeiliId(original_id), ...article };
    const getDocument = vi.fn().mockResolvedValue(stored);
    const index = vi.fn(() => ({ getDocument }));
    const multiSearch = vi.fn().mockResolvedValue({
      hits: [
        { title, source: "calendar", url: "https://vancouver.calendar.ubc.ca/other-guide", date: null },
        { ...article, _formatted: { search_sections: { part_0: "…<mark>Registration</mark> guidance…" } } },
      ],
    });
    llm.converseStream
      .mockImplementationOnce(async function* () {
        yield { type: "tool_use", toolUseId: "search", name: "search_ubc_pages", input: { query: "registration" } };
        yield { type: "stop", reason: "tool_use" };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "tool_use", toolUseId: "read", name: "get_document", input: { article_id: original_id } };
        yield { type: "stop", reason: "tool_use" };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "text", delta: "Confirm your selection and keep the faculty conditions [2]." };
        yield { type: "stop", reason: "end_turn" };
      });
    const events = await Array.fromAsync(
      streamAgent([{ role: "user", content: "Read the registration steps." }], {
        modules: [pages, documents],
        search: { index, multiSearch } as unknown as SearchClient,
      }),
    );
    expect(index).toHaveBeenCalledExactlyOnceWith("documents");
    expect(getDocument).toHaveBeenCalledExactlyOnceWith(sanitizeMeiliId(original_id));
    expect(multiSearch).toHaveBeenCalledTimes(1);
    const request = llm.converseStream.mock.calls[2][0];
    const read = request.messages
      .flatMap((message) => message.content)
      .find((block) => block.toolResult?.toolUseId === "read")?.toolResult;
    expect(read?.content).toEqual([
      { json: article },
      { json: { source_citations: [{ citation: "[2]", label: title, source_url: article.source_url }] } },
    ]);
    expect(request.system).toContain(`[2] ${title} (${article.source_url})`);
    const done = events.find((event) => event.type === "done");
    expect(done?.tool_calls.map(({ name }) => name)).toEqual(["search_ubc_pages", "get_document"]);
    expect(JSON.stringify(done?.tool_calls[0].result)).not.toContain(content_markdown);
    expect(done?.tool_calls[1].result).toEqual(article);
    expect(done?.citations.map(({ index, used }) => ({ index, used }))).toEqual([
      { index: 1, used: false },
      { index: 2, used: true },
    ]);
    expect(done?.citations[1].detail).toMatchObject({
      original_id,
      subcategory: article.subcategory,
      retrieved_at: article.retrieved_at,
    });
    expect(stored).not.toHaveProperty("source_citations");
  },
);
