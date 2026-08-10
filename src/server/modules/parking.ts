import type { DatasetModule } from "../core/types";
import { searchNearable } from "./places";

export interface ParkingDoc {
  id: string;
  name: string;
  hours: string | null;
  rate: string | null; // free text, e.g. "$4.50 per hour"
  rate_evening: string | null;
  rate_holiday: string | null;
  accessible_stalls: boolean;
  motorcycle: boolean;
  bike_cage: boolean;
  elevator: boolean;
  ev_charging: boolean;
  permit_required: boolean;
  payment_link: string | null;
  lat: number;
  lon: number;
}

// biome-ignore lint/suspicious/noExplicitAny: raw GeoJSON features
type Feature = Record<string, any>;

const flag = (v: unknown) => v === "1" || v === 1 || v === true; // source booleans are "0"/"1" strings

export function transformParking(f: Feature): { id: string; doc: ParkingDoc } | null {
  const p = f?.properties ?? {};
  const coords = f?.geometry?.coordinates;
  if (p.FAC_ID == null || !p.FAC_DESCRIPTION || !Array.isArray(coords)) return null;
  return {
    id: String(p.FAC_ID),
    doc: {
      id: String(p.FAC_ID),
      name: String(p.FAC_DESCRIPTION),
      hours: p.FAC_HOURSDAY ?? null,
      rate: p.FAC_RATE ?? null,
      rate_evening: p.FAC_RATEPM ?? null,
      rate_holiday: p.FAC_RATEHOL ?? null,
      accessible_stalls: flag(p.FAC_DISABLED),
      motorcycle: flag(p.FAC_MC),
      bike_cage: flag(p.FAC_BIKE),
      elevator: flag(p.FAC_ELEVATOR),
      ev_charging: flag(p.FAC_EV),
      permit_required: flag(p.FAC_UNDERPERMIT),
      payment_link: typeof p.PAYMENT_LINK === "string" ? p.PAYMENT_LINK.trim() : null,
      lon: coords[0],
      lat: coords[1],
    },
  };
}

export const parking: DatasetModule = {
  name: "parking",
  indices: [
    {
      index: "parking",
      settings: {
        searchableAttributes: ["name"],
        filterableAttributes: ["ev_charging", "accessible_stalls", "motorcycle", "bike_cage"],
      },
      async *read(store) {
        yield* (
          (await store.getJson("geospatial/ubcv/parking/geojson/ubcv_parking_www.geojson")) as {
            features: Feature[];
          }
        ).features;
      },
      transform: transformParking,
    },
  ],
  tools: [
    {
      spec: {
        name: "find_parking",
        description:
          "Find public parking on UBC Vancouver campus with rates, hours, EV charging, accessibility, and payment links. Optionally sorted by walking distance from a building.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: 'Optional name keywords, e.g. "Rose Garden"' },
              near_building: {
                type: "string",
                description: "Optional building code or name to sort results by walking distance from",
              },
              ev_charging: { type: "boolean", description: "If true, only facilities with EV charging" },
              limit: { type: "number", description: "Max results (default 5)" },
            },
            required: [],
          },
        },
      },
      async execute(input, search) {
        const queryText = input.query ? String(input.query) : "";
        const filters: string[] = [];
        if (input.ev_charging) filters.push("ev_charging = true");
        const limit = Math.min(Number(input.limit) || 5, 20);
        const { results, near, truncated_before_sort } = await searchNearable<ParkingDoc>(
          search,
          "parking",
          queryText,
          filters.length > 0 ? filters.join(" AND ") : undefined,
          input.near_building,
          limit,
        );
        if (results.length === 0) throw new Error(`No parking facilities matched`);
        return {
          ...(near ? { near_building: near.code } : {}),
          ...(truncated_before_sort ? { note: "Many matches exist; nearest results may be approximate." } : {}),
          parking: results,
        };
      },
    },
  ],
};
