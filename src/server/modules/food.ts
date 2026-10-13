import type { DatasetModule, SearchClient } from "../core/types";
import { resolveBuilding } from "./buildings";
import { stripHtml } from "./html";
import { nearestFirst, type PoiDoc } from "./places";

export interface FoodDoc {
  id: string;
  name: string;
  /** Outlet blurb from food.ubc.ca; mentions meal-plan acceptance and location in prose. */
  text: string;
  url: string | null;
}

/** An outlet plus the coordinates and hours of the campus POI that shares its name, when one does. */
export type FoodHit = FoodDoc & { service_type: "food"; lat?: number; lon?: number; hours?: string | null };

// biome-ignore lint/suspicious/noExplicitAny: raw WordPress rows
type Row = Record<string, any>;

export function transformFood(row: Row): { id: string; doc: FoodDoc } | null {
  const name = stripHtml(row?.title?.rendered);
  if (row?.id == null || !name) return null;
  // Excerpts open with a "Feed Me / … / <short name> <short name>" breadcrumb plus
  // page heading (the short name can differ from the title) and close with "Read more".
  const text = stripHtml(row.excerpt?.rendered)
    .replace(/^Feed Me(?: \/ [^/]+?)*? \/ ([^/]+?) \1 /, "")
    .replace(/^Feed Me(?: \/ [^/]*?)* \/ /, "")
    .replace(/\s*Read more\s*$/, "")
    .trim();
  return { id: String(row.id), doc: { id: String(row.id), name, text, url: row.link ?? null } };
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Borrows coordinates and hours from the campus POI whose name matches the outlet's. */
// Name-join heuristic against the poi index, one search per outlet; replace when food.ubc.ca exposes coordinates.
async function withCoordinates(search: SearchClient, outlets: FoodDoc[]): Promise<FoodHit[]> {
  return Promise.all(
    outlets.map(async (outlet) => {
      const hit = (await search.index("poi").search(outlet.name, { limit: 1 })).hits[0] as PoiDoc | undefined;
      const a = normalize(outlet.name);
      const b = hit ? normalize(hit.name) : "";
      const matched = hit && a && b && (a.includes(b) || b.includes(a));
      return matched
        ? { ...outlet, service_type: "food" as const, lat: hit.lat, lon: hit.lon, hours: hit.hours }
        : { ...outlet, service_type: "food" as const };
    }),
  );
}

export const food: DatasetModule = {
  name: "food",
  indices: [
    {
      index: "food",
      settings: { searchableAttributes: ["name", "text"] },
      async *read(store) {
        yield* (await store.getJson("campus-services/food_outlets.json")) as Row[];
      },
      transform: transformFood,
    },
  ],
  tools: [
    {
      spec: {
        name: "find_food",
        description:
          "Find UBC Food Services outlets (food.ubc.ca): dining halls, cafes, and campus partners, with their description and which meal plans they accept. Results carry coordinates and hours only when a campus POI shares the outlet's name; pass near_building to sort those by walking distance. For hours-first or map-first cafe and restaurant questions, prefer find_places.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: 'Optional keywords, e.g. "sushi", "meal plan", "Kyros"' },
              near_building: {
                type: "string",
                description: "Optional building code or name to sort located outlets by walking distance from",
              },
              limit: { type: "number", description: "Max results (default 10)" },
            },
            required: [],
          },
        },
      },
      async execute(input, search) {
        const limit = Math.min(Number(input.limit) || 10, 30);
        const res = await search.index("food").search(input.query ? String(input.query) : "", {
          limit: input.near_building ? 100 : limit,
        });
        let places = await withCoordinates(search, res.hits as unknown as FoodDoc[]);
        if (places.length === 0) throw new Error(`No food outlets matched "${input.query ?? ""}"`);
        let near: string | undefined;
        if (input.near_building) {
          const from = await resolveBuilding(search, String(input.near_building));
          near = from.code;
          const located = places.filter((p): p is FoodHit & { lat: number; lon: number } => p.lat != null);
          const unlocated = places.filter((p) => p.lat == null);
          places = [...nearestFirst(located, from), ...unlocated].slice(0, limit);
        }
        return { ...(near ? { near_building: near } : {}), places };
      },
    },
  ],
};
