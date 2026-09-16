import type { SearchClient } from "@/src/server/core/types";
import { describe, expect, it, vi } from "vitest";
import { pages } from "./pages";

function fixture() {
  const search = vi
    .fn()
    .mockResolvedValue({
      hits: [
        {
          title: "Example policy",
          url: "https://example.test/policy",
          source: "calendar",
          date: null,
          _formatted: { text: "x".repeat(900) },
        },
      ],
    });
  const index = vi.fn(() => ({ search }));
  return { search, index, client: { index } as unknown as SearchClient };
}

const tool = pages.tools[0];
describe("legacy page search", () => {
  it("queries only the pages index with escaped filters and bounded excerpts", async () => {
    const f = fixture();
    const result = (await tool.execute(
      { query: " policy ", source: 'calendar" OR source = "news', limit: 50 },
      f.client,
    )) as { pages: { snippets: string[] }[] };
    expect(f.index).toHaveBeenCalledExactlyOnceWith("pages");
    expect(f.search).toHaveBeenCalledExactlyOnceWith("policy", {
      filter: `source = ${JSON.stringify('calendar" OR source = "news')}`,
      limit: 20,
      attributesToHighlight: ["text"],
    });
    expect(result.pages[0].snippets[0]).toHaveLength(750);
  });

  it.each([
    { query: "" },
    { query: 1 },
    { query: "policy", source: [] },
    { query: "policy", limit: 0 },
    { query: "policy", limit: 1.5 },
  ])("rejects invalid input before searching: %j", async (input) => {
    const f = fixture();
    await expect(tool.execute(input, f.client)).rejects.toThrow();
    expect(f.index).not.toHaveBeenCalled();
  });

  it("reports an empty result without asserting that a policy does not exist", async () => {
    const f = fixture();
    f.search.mockResolvedValue({ hits: [] });
    await expect(tool.execute({ query: "policy" }, f.client)).rejects.toThrow('No UBC pages matched "policy"');
  });
});
