import { Meilisearch } from "meilisearch";
import { describe, expect, it } from "vitest";
import type { SearchClient } from "../core/types";
import { resolveBuilding } from "./buildings";
import { createWidgetsModule } from "./widgets";

const payloads = [
  "../../../%6b%65%79%73",
  "..\\..\\keys",
  "%2e%2e%2fkeys",
  "ICCS?fields=secret",
  "ICCS#fragment",
  "' OR code != 'x",
];

function recordingSearch() {
  const requests: { url: string; method: string }[] = [];
  const search = new Meilisearch({
    host: "http://search.invalid:7700",
    apiKey: "fixture-only-key",
    httpClient: async (input, init) => {
      requests.push({ url: String(input), method: init?.method ?? "GET" });
      return { hits: [{ code: "ICCS", name: "ICICS", aliases: [], lat: 49.26, lon: -123.25 }] };
    },
  }) as unknown as SearchClient;
  return { search, requests };
}

describe("building document request confinement", () => {
  it.each(payloads)("keeps untrusted names out of exact document paths: %s", async (payload) => {
    const { search, requests } = recordingSearch();
    await resolveBuilding(search, payload);
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(new URL(request.url).pathname).toBe("/indexes/buildings/search");
      expect(request.method).toBe("POST");
    }
  });

  it.each(payloads)("rejects invalid rich-widget IDs before transport: %s", async (payload) => {
    const { search, requests } = recordingSearch();
    const tool = createWidgetsModule().tools[0];
    await expect(tool.execute({ type: "building_detail", building_code: payload }, search)).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });
});
