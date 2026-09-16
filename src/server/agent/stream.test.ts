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
