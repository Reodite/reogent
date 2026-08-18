import { canonicalize } from "@/src/shared/course-code";
import type { CanonicalCode } from "@/src/shared/course-code";
import { describe, expect, it } from "vitest";
import type { SearchClient } from "../core/types";
import type { CourseDoc } from "../modules/courses";
import { buildPrereqGraph } from "./build-graph";

function code(input: string): CanonicalCode {
  const c = canonicalize(input);
  if (!c || c.kind !== "code") throw new Error(`not a code: ${input}`);
  return c;
}

function doc(code: string, fields: { prerequisite?: string | null; corequisite?: string | null }): CourseDoc {
  return {
    code,
    subject: code.split(" ")[0],
    number: code.split(" ")[1],
    title: "",
    description: "",
    credits: null,
    prerequisite: fields.prerequisite ?? null,
    corequisite: fields.corequisite ?? null,
    sections: [],
    terms: [],
  };
}

function mockSearch(docs: CourseDoc[]): SearchClient {
  const byCode = new Map<string, CourseDoc>();
  for (const d of docs) byCode.set(d.code, d);
  const lookup = (filter: string): CourseDoc | undefined => {
    const m = filter.match(/code = '([^']+)'/);
    if (!m) return undefined;
    const raw = m[1];
    return byCode.get(raw) ?? byCode.get(raw.replace(/_V /, " "));
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

describe("buildPrereqGraph", () => {
  it("returns found:false when the root is not in the catalog", async () => {
    const search = mockSearch([]);
    const g = await buildPrereqGraph(code("CPSC 110"), search);
    expect(g.found).toBe(false);
    expect(g.nodes).toEqual([]);
    expect(g.hasPrereqs).toBe(false);
    expect(g.hasCoreqs).toBe(false);
  });

  it("returns an empty tree when the root has no prereqs and no coreqs", async () => {
    const search = mockSearch([doc("CPSC 110", {})]);
    const g = await buildPrereqGraph(code("CPSC 110"), search);
    expect(g.found).toBe(true);
    expect(g.hasPrereqs).toBe(false);
    expect(g.hasCoreqs).toBe(false);
    expect(g.nodes.map((n) => n.id)).toEqual(["CPSC 110"]);
    expect(g.edges).toEqual([]);
  });

  it("walks a one-level prereq chain and marks known nodes", async () => {
    const search = mockSearch([doc("CPSC 110", { prerequisite: "CPSC 109" }), doc("CPSC 109", {})]);
    const g = await buildPrereqGraph(code("CPSC 110"), search);
    expect(g.found).toBe(true);
    expect(g.hasPrereqs).toBe(true);
    expect(g.hasCoreqs).toBe(false);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["CPSC 109", "CPSC 110"]);
    const root = g.nodes.find((n) => n.id === "CPSC 110");
    const prereq = g.nodes.find((n) => n.id === "CPSC 109");
    expect(root?.variant).toBe("root");
    expect(prereq?.variant).toBe("known");
    expect(g.edges.some((e) => e.source === "CPSC 110" && e.target === "CPSC 109")).toBe(true);
  });

  it("dedupes a cycle so each code appears once (REQ-7.1)", async () => {
    const search = mockSearch([
      doc("CPSC 110", { prerequisite: "CPSC 109" }),
      doc("CPSC 109", { prerequisite: "CPSC 110" }),
    ]);
    const g = await buildPrereqGraph(code("CPSC 110"), search);
    const codes = g.nodes.filter((n) => n.kind === "course").map((n) => n.code);
    const counts = new Map<string, number>();
    for (const c of codes) counts.set(c as string, (counts.get(c as string) ?? 0) + 1);
    for (const [, count] of counts) expect(count).toBe(1);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["CPSC 109", "CPSC 110"]);
  });

  it("stops emitting ancestors past depthCap (REQ-7.2)", async () => {
    const search = mockSearch([
      doc("CPSC 100", { prerequisite: "CPSC 110" }),
      doc("CPSC 110", { prerequisite: "CPSC 120" }),
      doc("CPSC 120", { prerequisite: "CPSC 130" }),
      doc("CPSC 130", {}),
    ]);
    const g = await buildPrereqGraph(code("CPSC 100"), search, { depthCap: 2 });
    const maxDepth = Math.max(...g.nodes.map((n) => n.depth ?? 0));
    expect(maxDepth).toBeLessThanOrEqual(2);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["CPSC 100", "CPSC 110", "CPSC 120"]);
  });

  it("emits coreq nodes adjacent to root and walks their prereqs only (REQ-7.3, REQ-7.4)", async () => {
    const search = mockSearch([
      doc("CPSC 320", { corequisite: "MATH 200", prerequisite: "CPSC 221" }),
      doc("MATH 200", { prerequisite: "MATH 100" }),
      doc("MATH 100", {}),
      doc("CPSC 221", {}),
    ]);
    const g = await buildPrereqGraph(code("CPSC 320"), search);
    const coreq = g.nodes.find((n) => n.id === "MATH 200");
    expect(coreq?.kind).toBe("coreq");
    expect(coreq?.variant).toBe("coreq");
    expect(coreq?.depth).toBe(1);
    expect(g.hasCoreqs).toBe(true);
    expect(g.edges.some((e) => e.source === "CPSC 320" && e.target === "MATH 200")).toBe(true);
    // CPSC 320's prereq (CPSC 221) at depth 1.
    expect(g.nodes.find((n) => n.id === "CPSC 221")?.depth).toBe(1);
    // MATH 200's prereq (MATH 100) at depth 2; MATH 200 is NOT marked as a coreq-of-coreq target.
    const math100 = g.nodes.find((n) => n.id === "MATH 100");
    expect(math100?.kind).toBe("course");
    expect(math100?.depth).toBe(2);
    // No coreq -> coreq edge: every edge whose source is a coreq node targets a course node.
    for (const e of g.edges) {
      const src = g.nodes.find((n) => n.id === e.source);
      const tgt = g.nodes.find((n) => n.id === e.target);
      if (src?.kind === "coreq") expect(tgt?.kind).not.toBe("coreq");
    }
  });

  it("records a selection key for each disjunction (REQ-8.1)", async () => {
    const search = mockSearch([
      doc("CPSC 320", { prerequisite: "one of MATH 200, MATH 220" }),
      doc("MATH 200", {}),
      doc("MATH 220", {}),
    ]);
    const g = await buildPrereqGraph(code("CPSC 320"), search);
    // Root AST node has path "" (matches the softToggles[''] convention), so the key is "CPSC 320::".
    expect(g.selectionKeys).toContain("CPSC 320::");
    const dropdown = g.nodes.find((n) => n.selectionKey === "CPSC 320::");
    expect(dropdown?.kind).toBe("dropdown");
    expect(dropdown?.ui).toBe("dropdown");
    expect(dropdown?.children?.sort()).toEqual(["MATH 200", "MATH 220"]);
  });
});
