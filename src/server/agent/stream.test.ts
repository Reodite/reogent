import { afterEach, expect, it, vi } from "vitest";
import type { DatasetModule, SearchClient } from "../core/types";
import type { LlmAdapter } from "../llm/types";
import { streamAgent } from "./stream";

const llm = vi.hoisted(() => ({ converseStream: vi.fn<LlmAdapter["converseStream"]>() }));
vi.mock("../llm", () => ({ converse: vi.fn(), converseStream: llm.converseStream }));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("carries the assigned source marker into follow-up article results without changing stored data", async () => {
  vi.useFakeTimers();
  const first = {
    title: "Example guide",
    url: "https://example.test/first",
    category: "documents",
    subcategory: "workday",
    original_id: "documents:workday:first",
  };
  const second = { ...first, url: "https://example.test/second", original_id: "documents:workday:second" };
  const article = {
    title: second.title,
    category: second.category,
    subcategory: second.subcategory,
    original_id: second.original_id,
    source_url: second.url,
    content_markdown: "Confirm your selection.",
  };
  const module: DatasetModule = {
    name: "fixture",
    indices: [],
    tools: [
      {
        spec: { name: "search_ubc_pages", description: "Search fixtures", inputSchema: { json: { type: "object" } } },
        execute: async () => ({ pages: [first, second] }),
      },
      {
        spec: { name: "get_document", description: "Read fixture", inputSchema: { json: { type: "object" } } },
        execute: async () => article,
      },
    ],
  };
  llm.converseStream
    .mockImplementationOnce(async function* () {
      yield { type: "tool_use", toolUseId: "search", name: "search_ubc_pages", input: { query: "guide" } };
      yield { type: "stop", reason: "tool_use" };
    })
    .mockImplementationOnce(async function* () {
      yield {
        type: "tool_use",
        toolUseId: "article",
        name: "get_document",
        input: { article_id: second.original_id },
      };
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
    .find((block) => block.toolResult?.name === "get_document")?.toolResult;
  expect(response?.content).toEqual([
    { json: article },
    {
      json: {
        source_citations: [{ citation: "[2]", label: second.title, source_url: second.url }],
      },
    },
  ]);
  const done = events.find((event) => event.type === "done");
  expect(done?.tool_calls[1].result).toEqual(article);
  expect(done?.citations.map(({ index, used }) => ({ index, used }))).toEqual([
    { index: 1, used: false },
    { index: 2, used: true },
  ]);
});
