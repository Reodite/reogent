import { canonicalize } from "@/src/shared/course-code";
import type { DatasetModule } from "../core/types";
import { buildPrereqGraph } from "./build-graph";

/** Prereq-tree module: a tool-only module (no ingest index) that derives from
 *  the courses index. Registered as module #13 in src/server/modules/index.ts;
 *  its tool surfaces in the agent's tool list via the existing
 *  modules.flatMap(m => m.tools) aggregation at src/server/agent/stream.ts. */
export const prereqModule: DatasetModule = {
  name: "prereq",
  indices: [],
  tools: [
    {
      spec: {
        name: "get_prereq_tree",
        description:
          'Get the transitive prerequisite graph for one UBC Vancouver course: every ancestor prereq (BFS, depth-capped at 15), the coreq column adjacent to the root with coreq-of-coreq not walked, disjunction selection keys, and known/unknown node variants. Pass a course code such as "CPSC 320".',
        inputSchema: {
          json: {
            type: "object",
            properties: {
              course_code: { type: "string", description: 'Root course code, e.g. "CPSC 320" or "CPSC_V 110"' },
            },
            required: ["course_code"],
          },
        },
      },
      async execute(input, search) {
        const code = canonicalize(String(input.course_code ?? ""));
        if (!code || code.kind !== "code") throw new Error(`Invalid course code "${input.course_code}"`);
        return buildPrereqGraph(code, search);
      },
    },
  ],
};
