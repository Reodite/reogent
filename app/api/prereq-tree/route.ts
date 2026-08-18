import { requireUser } from "@/src/server/auth";
import { buildPrereqGraph } from "@/src/server/prereq/build-graph";
import { rateLimitResponse } from "@/src/server/rate-limit";
import { getSearch } from "@/src/server/search";
import { canonicalize } from "@/src/shared/course-code";
import { json, serverError } from "../http";

const PREREQ_LIMIT = { windowMs: 60_000, maxRequests: 10 };

/** GET /api/prereq-tree?root=CPSC+320 — transitive prereq graph for a root course. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const limited = rateLimitResponse(`prereq:${user.sub}`, PREREQ_LIMIT);
    if (limited) return limited;
    const root = (new URL(request.url).searchParams.get("root") ?? "").trim();
    if (!root) return json({ error: "root is required" }, 400);
    const result = canonicalize(root);
    if (result?.kind === "rejected") return json({ error: "Okanagan (_O) campus codes are not supported" }, 400);
    if (!result || result.kind !== "code") return json({ error: `"${root}" is not a valid course code` }, 400);
    const graph = await buildPrereqGraph(result, getSearch());
    return json(graph);
  } catch (e) {
    return serverError(e);
  }
}
