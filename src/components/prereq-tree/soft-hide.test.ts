import type { SearchClient } from "@/src/server/core/types";
import type { CourseDoc } from "@/src/server/modules/courses";
import { buildPrereqGraph } from "@/src/server/prereq/build-graph";
import { arbCode, arbCodeExpr } from "@/src/shared/arb";
import { canonicalize } from "@/src/shared/course-code";
import { displayExpr, walkCodeLeaves, type Expr } from "@/src/shared/prereq-ast";
import fc from "fast-check";
import { visibleGraph } from "./soft-hide";

// Synthetic descendant code arbCode never draws (its number range starts at 100),
// so every child code's prerequisite chain produces exactly one hard edge that
// the soft toggle can prune without colliding with the generated codes.
const DESCENDANT = "DEEP 000";

function doc(code: string, prerequisite: string): CourseDoc {
  return {
    code,
    subject: code.split(" ")[0],
    number: (code.split(" ")[1] ?? "").trim(),
    title: "",
    description: "",
    credits: null,
    prerequisite: prerequisite || null,
    corequisite: null,
    sections: [],
    terms: [],
  } as unknown as CourseDoc;
}

function mockSearch(docs: CourseDoc[]): SearchClient {
  const byCode = new Map(docs.map((d) => [d.code, d]));
  const lookup = (filter: string) => {
    const m = filter.match(/code = '([^']+)'/);
    return m ? byCode.get(m[1]) : undefined;
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

describe("visibleGraph soft-toggle properties (Domain 5)", () => {
  it("Property 36: disabling a root Soft's toggle (M['']===0) hides the child subtree's hard descendant edges; enabling (M['']===1) shows them (REQ-10.2)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.record({ root: arbCode, child: arbCodeExpr }), async ({ root, child }) => {
        const childCodes = walkCodeLeaves(child as Expr).map((c) => c.leaf.code);
        fc.pre(root.code !== DESCENDANT && !childCodes.includes(root.code));
        const phrase = childCodes.length === 1 ? "is recommended" : "are recommended";
        const docs = [
          doc(root.code, `${displayExpr(child as Expr)} ${phrase}`),
          ...childCodes.map((c) => doc(c, DESCENDANT)),
          doc(DESCENDANT, ""),
        ];
        const rc = canonicalize(root.code);
        if (rc?.kind !== "code") return true;
        const graph = await buildPrereqGraph(rc, mockSearch(docs));
        if (!graph.found) return true;
        const on = visibleGraph(graph, { "": 1 }).edges.length;
        const off = visibleGraph(graph, { "": 0 }).edges.length;
        expect(on).toBeGreaterThan(off);
      }),
      { numRuns: 40 },
    );
  });

  it("keeps the soft's incoming structural edge regardless of toggle state (pill re-enable)", () => {
    const graph = {
      rootCode: "MATH 100",
      nodes: [
        { id: "MATH 100", kind: "course", label: "MATH 100", variant: "root" },
        { id: "MATH 200", kind: "course", label: "MATH 200", variant: "known" },
        { id: "DEEP 000", kind: "course", label: "DEEP 000", variant: "known" },
      ],
      edges: [
        { id: "e1", source: "MATH 100", target: "MATH 200", optional: true, softPath: "" },
        { id: "e2", source: "MATH 200", target: "DEEP 000" },
      ],
      selectionKeys: [],
      hasPrereqs: true,
      hasCoreqs: false,
      found: true,
    } as const;
    expect(visibleGraph(graph, { "": 1 }).edges.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(visibleGraph(graph, { "": 0 }).edges.map((e) => e.id)).toEqual(["e1"]);
    expect(visibleGraph(graph, { "": 0 }).nodes.map((n) => n.id)).toEqual(["MATH 100", "MATH 200"]);
  });
});
