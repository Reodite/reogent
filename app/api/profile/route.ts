import { requireUser } from "@/src/server/auth";
import { getProfile, saveProfile } from "@/src/server/profile";
import { parseProfile } from "@/src/shared/profile";
import { json, readJson, requireJson, serverError } from "../http";

// A profile is three short fields; anything larger is not a profile.
const MAX_PROFILE_BYTES = 4096;

/** GET /api/profile — the caller's saved profile, or `{ profile: null }`. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    return json({ profile: await getProfile(user.sub) });
  } catch (e) {
    return serverError(e);
  }
}

/** PUT /api/profile — replaces the caller's profile. */
export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const ctError = requireJson(request);
    if (ctError) return ctError;

    const result = await readJson(request, MAX_PROFILE_BYTES);
    if (result instanceof Response) return result;
    const { body } = result;
    const parsed = parseProfile(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    await saveProfile(user.sub, parsed.value);
    return new Response(null, { status: 204 });
  } catch (e) {
    return serverError(e);
  }
}
