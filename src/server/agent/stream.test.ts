import { afterEach, expect, it, vi } from "vitest";
import type { DatasetModule, SearchClient } from "../core/types";
import type { LlmAdapter } from "../llm/types";
import { ITERATION_LIMIT } from "./loop";
import { streamAgent } from "./stream";

const llm = vi.hoisted(() => ({ converseStream: vi.fn<LlmAdapter["converseStream"]>() }));
vi.mock("../llm", () => ({ converse: vi.fn(), converseStream: llm.converseStream }));

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
