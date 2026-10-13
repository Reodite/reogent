import { requireUser } from "@/src/server/auth";
import { getPlan, savePlan } from "@/src/server/plans";
import { json, readJson, requireJson, serverError } from "../http";

// Generous ceiling for a serialized plan (a full 6-year board is a few KB);
// blocks arbitrary-blob abuse of the JSONB column.
const MAX_PLAN_BYTES = 262_144;

/** GET /api/plan — the caller's saved degree plan, or `{ plan: null }`. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    return json({ plan: await getPlan(user.sub) });
  } catch (e) {
    return serverError(e);
  }
}

/** PUT /api/plan — replaces the caller's saved degree plan. */
export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const ctError = requireJson(request);
    if (ctError) return ctError;

    const result = await readJson(request, MAX_PLAN_BYTES);
    if (result instanceof Response) return result;
    const { body } = result;
    // Minimal shape check — the plan is otherwise opaque client state.
    if (!body || typeof body !== "object" || !Array.isArray((body as { years?: unknown }).years)) {
      return json({ error: "Body must be a plan object with a years array" }, 400);
    }

    await savePlan(user.sub, body);
    return new Response(null, { status: 204 });
  } catch (e) {
    return serverError(e);
  }
}
