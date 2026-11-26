import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatasetModule, SearchClient } from "../core/types";
import { executeTool, isToolError } from "./executor";

const search = {} as SearchClient;

const spec = (name: string) => ({ name, description: "d", inputSchema: { json: {} } });

afterEach(() => vi.useRealTimers());

describe("tool executor", () => {
  // Feature: reodite, Property 4: Tool failures are contained
  it("Property 4: throwing tools, unknown tools, and empty results never escape as exceptions", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.anything().map((thrown) => ({ kind: "throws" as const, thrown })),
          fc.constant({ kind: "unknown" as const, thrown: undefined }),
          fc.constantFrom(null, undefined, []).map((empty) => ({ kind: "empty" as const, thrown: empty })),
        ),
        async (scenario) => {
          const modules: DatasetModule[] = [
            {
              name: "m",
              indices: [],
              tools: [
                {
                  spec: spec("t"),
                  execute: async () => {
                    if (scenario.kind === "throws") throw scenario.thrown;
                    return scenario.thrown; // empty result
                  },
                },
              ],
            },
          ];
          const name = scenario.kind === "unknown" ? "nope" : "t";
          const result = await executeTool(modules, name, {}, search);
          expect(isToolError(result)).toBe(true);
          const err = result as { status: "error"; message: string };
          expect(err.message.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("passes successful results through untouched", async () => {
    const modules: DatasetModule[] = [
      { name: "m", indices: [], tools: [{ spec: spec("ok"), execute: async () => ({ hits: 3 }) }] },
    ];
    expect(await executeTool(modules, "ok", {}, search)).toEqual({ hits: 3 });
  });

  it("clears the timeout after a tool settles", async () => {
    vi.useFakeTimers();
    const modules: DatasetModule[] = [
      { name: "m", indices: [], tools: [{ spec: spec("ok"), execute: async () => ({ hits: 3 }) }] },
    ];

    await expect(executeTool(modules, "ok", {}, search)).resolves.toEqual({ hits: 3 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
