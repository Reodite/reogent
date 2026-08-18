import { arbCourseDataset } from "@/src/shared/arb";
import { canonicalize } from "@/src/shared/course-code";
import { MAX_DEPTH } from "@/src/shared/prereq-ast";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SearchClient } from "../core/types";
import type { CourseDoc } from "../modules/courses";
import { buildPrereqGraph } from "./build-graph";

function mockSearch(docs: CourseDoc[]): SearchClient {
  const byCode = new Map<string, CourseDoc>(docs.map((d) => [d.code, d]));
  const lookup = (filter: string): CourseDoc | undefined => {
    const m = filter.match(/code = '([^']+)'/);
    if (!m) return undefined;
    return byCode.get(m[1]) ?? byCode.get(m[1].replace(/_V /, " "));
  };
  return {
    index: () => ({
      search: async (_q: string, opts?: { filter?: string }) => {
        const hit = opts?.filter ? lookup(opts.filter) : undefined;
        return { hits: hit ? [hit] : [] };
      },
    }),
  } as unknown as SearchClient;
}

function datasetToSearch(dataset: { code: string; prereq: string; coreq: string }[]): SearchClient {
  return mockSearch(
    dataset.map((d) => ({
      code: d.code,
      subject: d.code.split(" ")[0],
      number: (d.code.split(" ")[1] ?? "").trim(),
      title: "",
      description: "",
      credits: null,
      prerequisite: d.prereq || null,
      corequisite: d.coreq || null,
      sections: [],
      terms: [],
    })),
  );
}

const rootOf = (dataset: { code: string }[]) => {
  const r = canonicalize(dataset[0].code);
  return r && r.kind === "code" ? r : null;
};

const OPS = 30;

describe("buildPrereqGraph properties (Domain 4)", () => {
  it("Property 11: each code appears at most once in nodes (REQ-7.1)", async () => {
    await fc.assert(
      fc.asyncProperty(arbCourseDataset, fc.integer({ min: 0, max: MAX_DEPTH }), async (dataset, cap) => {
        const root = rootOf(dataset);
        if (!root) return true;
        const graph = await buildPrereqGraph(root, datasetToSearch(dataset), { depthCap: cap });
        const codes = graph.nodes.filter((n) => n.code).map((n) => n.code as string);
        return new Set(codes).size === codes.length;
      }),
      { numRuns: OPS },
    );
  });

  it("Property 12: no node has BFS depth greater than depthCap (REQ-7.2)", async () => {
    await fc.assert(
      fc.asyncProperty(arbCourseDataset, fc.integer({ min: 0, max: MAX_DEPTH }), async (dataset, cap) => {
        const root = rootOf(dataset);
        if (!root) return true;
        const graph = await buildPrereqGraph(root, datasetToSearch(dataset), { depthCap: cap });
        return graph.nodes.every((n) => (n.depth ?? 0) <= cap);
      }),
      { numRuns: OPS },
    );
  });

  it("Property 13: no coreq node has an outgoing edge to another coreq node (REQ-7.4)", async () => {
    await fc.assert(
      fc.asyncProperty(arbCourseDataset, async (dataset) => {
        const root = rootOf(dataset);
        if (!root) return true;
        const graph = await buildPrereqGraph(root, datasetToSearch(dataset));
        const byId = new Map(graph.nodes.map((n) => [n.id, n]));
        return graph.edges.every((e) => {
          const src = byId.get(e.source);
          const tgt = byId.get(e.target);
          return !(src?.kind === "coreq" && tgt?.kind === "coreq");
        });
      }),
      { numRuns: OPS },
    );
  });

  it("Property 14: every coreq node has BFS depth exactly 1 when hasCoreqs (REQ-7.3)", async () => {
    await fc.assert(
      fc.asyncProperty(arbCourseDataset, async (dataset) => {
        const root = rootOf(dataset);
        if (!root) return true;
        const graph = await buildPrereqGraph(root, datasetToSearch(dataset));
        if (!graph.hasCoreqs) return true;
        return graph.nodes.filter((n) => n.kind === "coreq").every((n) => n.depth === 1);
      }),
      { numRuns: OPS },
    );
  });
});
