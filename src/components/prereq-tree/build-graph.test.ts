import type { CourseIndexEntry } from "@/src/shared/course-index";
import { describe, expect, it } from "vitest";
import { buildGraph, normalize, suggestionPrefix, type CourseIndex } from "./build-graph";

const course = (code: string, title: string, prerequisite: string | null = null, corequisite: string | null = null) =>
  [code, { code, title, prerequisite, corequisite }] as [string, CourseIndexEntry];

// COGS 300-shaped fixture: an AND of a plain course + a "one of" dropdown,
// prose prereqs on a transitive course, coreqs on the root, and a
// recommendation tail (soft branch) on another course.
const INDEX: CourseIndex = new Map([
  course("ROOT 300", "Root Course", "AAA 200 and one of BBB 100, CCC 100.", "DDD 100 and EEE 100."),
  course("AAA 200", "Mid Course", "2nd-year class standing or higher."),
  course("BBB 100", "Dropdown Option One", "HHH 100."),
  course("CCC 100", "Dropdown Option Two"),
  course("DDD 100", "Coreq One"),
  course("EEE 100", "Coreq Two"),
  course("HHH 100", "Deep Prereq"),
  course("SOFT 300", "Soft Root", "AAA 200. BBB 100 is recommended."),
]);

const build = (root: string, selections = new Map<string, number>(), softDisabled = new Map<string, boolean>()) =>
  buildGraph(
    root,
    INDEX,
    selections,
    () => {},
    softDisabled,
    () => {},
  );

const nodeById = (g: ReturnType<typeof build>, id: string) => {
  const n = g.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`missing node ${id}`);
  return n;
};

describe("buildGraph (ported reodite logic)", () => {
  it("absorbs the selected dropdown option: no separate course node, its prereqs feed the group", () => {
    const g = build("ROOT 300");
    const ids = g.nodes.map((n) => n.id);
    const group = ids.find((id) => id.startsWith("grp:ROOT 300::"));
    expect(group).toBeTruthy();
    // Selected option (BBB 100) is absorbed into the dropdown block.
    expect(ids).not.toContain("BBB 100");
    // Non-selected option renders nothing either.
    expect(ids).not.toContain("CCC 100");
    // The absorbed course's own prereq trails the group.
    expect(ids).toContain("HHH 100");
    expect(g.edges.some((e) => e.source === "HHH 100" && e.target === group)).toBe(true);
    // The dropdown detail row shows the absorbed course.
    const groupData = nodeById(g, group as string).data as { detail: { code: string } };
    expect(groupData.detail.code).toBe("BBB 100");
  });

  it("re-absorbs on selection change and drops the old option's subtree", () => {
    const g = build("ROOT 300");
    const group = g.nodes.filter((n) => n.id.startsWith("grp:")).map((n) => n.id)[0] as string;
    const key = group.slice("grp:".length);
    const flipped = build("ROOT 300", new Map([[key, 1]]));
    const ids = flipped.nodes.map((n) => n.id);
    expect(ids).not.toContain("CCC 100");
    expect(ids).not.toContain("HHH 100"); // BBB's prereq no longer loads
    const groupData = nodeById(flipped, group).data as { detail: { code: string } };
    expect(groupData.detail.code).toBe("CCC 100");
  });

  it("renders prose prereqs as note blocks feeding their course", () => {
    const g = build("ROOT 300");
    const noteId = g.nodes.map((n) => n.id).find((id) => id.startsWith("note:AAA 200"));
    expect(noteId).toBeTruthy();
    const note = nodeById(g, noteId as string);
    expect((note.data as { variant: string; text: string }).variant).toBe("note");
    expect(g.edges.some((e) => e.source === note.id && e.target === "AAA 200")).toBe(true);
  });

  it("chains coreqs above the root: top coreq → bottom coreq → root, with co-req labels", () => {
    const g = build("ROOT 300");
    const coreqEdges = g.edges.filter((e) => typeof e.id === "string" && e.id.startsWith("coreq:"));
    expect(coreqEdges).toHaveLength(2);
    const toRoot = coreqEdges.filter((e) => e.target === "ROOT 300");
    expect(toRoot).toHaveLength(1);
    const other = coreqEdges.find((e) => e.target !== "ROOT 300");
    expect(other?.target).toBe(toRoot[0].source);
    for (const e of coreqEdges) {
      expect(e.label).toBe("co-req");
      expect(e.data?.semanticTarget).toBe("ROOT 300");
    }
    const ddd = nodeById(g, "DDD 100");
    expect((ddd.data as { coreq?: boolean }).coreq).toBe(true);
  });

  it.each(["AAA 200.", "One of AAA 200, DDD 200."])(
    "expands prerequisite chains behind corequisite %j",
    (corequisite) => {
      const index: CourseIndex = new Map([
        course("ROOT 300", "Root", null, corequisite),
        course("AAA 200", "Corequisite", "BBB 100.", "EEE 100."),
        course("BBB 100", "Prerequisite", "CCC 100."),
        course("CCC 100", "Transitive prerequisite", "BBB 100."),
        course("DDD 200", "Alternative"),
        course("EEE 100", "Non-root corequisite"),
      ]);
      const graph = buildGraph(
        "ROOT 300",
        index,
        new Map(),
        () => {},
        new Map(),
        () => {},
      );
      expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["BBB 100", "CCC 100"]));
      expect(graph.edges).toEqual(
        expect.arrayContaining([expect.objectContaining({ source: "CCC 100", target: "BBB 100" })]),
      );
      expect(graph.nodes.some((node) => node.id === "EEE 100")).toBe(false);
      expect(graph.nodes.some((node) => node.id === "DDD 200")).toBe(false);
    },
  );

  it("records semantic targets only for top-level corequisite layout edges", () => {
    const index = new Map([
      ...INDEX,
      course("ROOT 300", "Root Course", null, "DDD 100 and either (a) BBB 100 and CCC 100 or (b) EEE 100."),
    ]);
    const graph = buildGraph(
      "ROOT 300",
      index,
      new Map(),
      () => {},
      new Map(),
      () => {},
    );
    const group = graph.nodes.find((node) => node.type === "radio")!;
    const siblingEdge = graph.edges.find((edge) => edge.source === "DDD 100")!;
    expect(siblingEdge.target).toBe(group.id);
    expect(siblingEdge.data?.semanticTarget).toBe("ROOT 300");
    expect(graph.edges.find((edge) => edge.source === group.id)?.data?.semanticTarget).toBe("ROOT 300");
    for (const code of ["BBB 100", "CCC 100"]) {
      const edge = graph.edges.find((candidate) => candidate.source === code)!;
      expect(edge.target).toBe(group.id);
      expect(edge.data?.semanticTarget).toBeUndefined();
    }
  });

  it("connects prerequisites to their dependent course", () => {
    const g = build("ROOT 300");
    const edge = g.edges.find((e) => e.source === "AAA 200" && e.target === "ROOT 300");
    expect(edge).toBeTruthy();
  });

  it("marks optional branches and suppresses their upstream prerequisites when disabled", () => {
    const g = build("SOFT 300");
    const softEdges = g.edges.filter((e) => typeof e.id === "string" && e.id.startsWith("soft:"));
    expect(softEdges.length).toBeGreaterThan(0);
    const soft = softEdges[0];
    expect(soft.type).toBe("optional");
    const key = (soft.data as { softKey: string }).softKey;
    // Enabled: the recommended course's own prereq (HHH 100) loads.
    expect(g.nodes.some((n) => n.id === "HHH 100")).toBe(true);
    const disabled = build("SOFT 300", new Map(), new Map([[key, true]]));
    expect(disabled.nodes.some((n) => n.id === "HHH 100")).toBe(false);
  });

  it("returns an empty graph for an unknown root", () => {
    expect(build("NOPE 999").nodes).toHaveLength(0);
  });
});

describe("type-ahead helpers (ported reodite logic)", () => {
  it("normalize folds case, _V suffix, and missing space", () => {
    expect(normalize("cpsc110")).toBe("CPSC 110");
    expect(normalize("CPSC_V 110")).toBe("CPSC 110");
    expect(normalize("some prose")).toBe("SOME PROSE");
  });

  it("suggestionPrefix yields code-shaped prefixes only", () => {
    expect(suggestionPrefix("cpsc")).toBe("CPSC");
    expect(suggestionPrefix("math1")).toBe("MATH 1");
    expect(suggestionPrefix("320")).toBeNull();
    expect(suggestionPrefix("linear")).toBeNull();
    expect(suggestionPrefix("c")).toBeNull();
  });
});
