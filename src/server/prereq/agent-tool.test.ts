import { describe, expect, it } from "vitest";
import type { SearchClient } from "../core/types";
import type { CourseDoc } from "../modules/courses";
import { prereqModule } from "./agent-tool";

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

const tool = prereqModule.tools[0];

describe("get_prereq_tree tool", () => {
  it("rejects an invalid course code", async () => {
    await expect(tool.execute({ course_code: "not a code" }, mockSearch([]))).rejects.toThrow();
  });

  it("returns the prereq graph for a valid root", async () => {
    const search = mockSearch([doc("CPSC 110", { prerequisite: "CPSC 109" }), doc("CPSC 109", {})]);
    const graph = (await tool.execute({ course_code: "CPSC 110" }, search)) as Record<string, unknown>;
    expect(graph).toMatchObject({ rootCode: "CPSC 110", found: true, hasPrereqs: true });
  });

  it("module is tool-only with no ingest indices", () => {
    expect(prereqModule.indices).toEqual([]);
    expect(prereqModule.tools).toHaveLength(1);
  });
});
