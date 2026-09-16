import { resolveBuilding } from "@/src/server/modules/buildings";
import { route } from "@/src/server/routing";
import { getSearch } from "@/src/server/search";
import { json, serverError } from "../http";

/** GET /api/route?from=ICCS&to=NEST — walking route between two buildings,
 *  with the polyline for drawing on the map. */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const fromQuery = url.searchParams.get("from");
    const toQuery = url.searchParams.get("to");
    if (!fromQuery || !toQuery) return json({ error: "Query params 'from' and 'to' are required" }, 400);

    const search = getSearch();
    let from: Awaited<ReturnType<typeof resolveBuilding>>;
    let to: Awaited<ReturnType<typeof resolveBuilding>>;
    try {
      [from, to] = await Promise.all([resolveBuilding(search, fromQuery), resolveBuilding(search, toQuery)]);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Unknown building" }, 404);
    }

    const result = await route(from, to);
    return json({
      from: from.code,
      to: to.code,
      ...result,
      polyline: result.method === "network" ? result.polyline : [],
    });
  } catch (e) {
    return serverError(e);
  }
}
