import type { DatasetModule } from "../core/types";

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
  tools: [],
};
