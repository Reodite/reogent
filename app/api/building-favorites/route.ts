import { requireUser } from "@/src/server/auth";
import { listBuildingFavorites, setBuildingFavorite } from "@/src/server/building-favorites";
import { getBuildingsGeoJson } from "@/src/server/modules/buildings";
import { json, requireJson, serverError } from "../http";

const MAX_BODY_BYTES = 256;

async function validBuildingCode(value: unknown): Promise<string | null> {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,8}$/.test(code)) return null;
  const collection = await getBuildingsGeoJson();
  return collection.features.some((feature) => String(feature.properties?.BLDG_CODE ?? "").toUpperCase() === code)
    ? code
    : null;
}

/** Returns the caller's favorite building codes in recent-save order. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    return json({ codes: await listBuildingFavorites(user.sub) });
  } catch (error) {
    return serverError(error);
  }
}

/** Applies one favorite state idempotently. */
export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const contentTypeError = requireJson(request);
    if (contentTypeError) return contentTypeError;
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "Favorite request too large" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    if (!body || typeof body !== "object" || typeof (body as { saved?: unknown }).saved !== "boolean") {
      return json({ error: "Favorite request requires code and saved state" }, 400);
    }
    const code = await validBuildingCode((body as { code?: unknown }).code);
    if (!code) return json({ error: "Unknown building code" }, 404);
    return json({ codes: await setBuildingFavorite(user.sub, code, (body as { saved: boolean }).saved) });
  } catch (error) {
    return serverError(error);
  }
}
