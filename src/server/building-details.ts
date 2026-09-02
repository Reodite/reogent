import type {
  AvailabilityRoomCard,
  BuildingAddress,
  BuildingDataAssociation,
  BuildingDataFreshness,
  BuildingDetails,
  BuildingEntranceSummary,
  BuildingProfile,
  BuildingSourceStatus,
  OfficialBuildingPhoto,
  PoiCard,
  RoomCard,
} from "@/src/lib/api-types";
import { buildingFromFeature } from "@/src/lib/building-catalog";
import { pointInFeature, type BuildingFeature } from "@/src/lib/geo";
import type { FeatureCollection } from "geojson";
import type { SearchClient } from "./core/types";
import { dataStore } from "./data";
import { getIndexFreshness } from "./freshness";
import { getBuildingsGeoJson, getPublicEntrancesGeoJson, resolveBuilding } from "./modules/buildings";
import { transformPoi, type PoiDoc } from "./modules/places";
import type { AvailabilityDoc, LibRoomDoc, StudySpaceDoc } from "./modules/spaces";

const ADDRESS_KEY = "geospatial/ubcv/locations/geojson/ubcv_address.geojson";
const POI_KEY = "geospatial/ubcv/locations/geojson/ubcv_poi.geojson";
const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value: string) => new Date(value.replace(" ", "T"));
const hhmm = (value: string | null) => (value && value.length >= 16 ? value.slice(11, 16) : null);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function booleanFlag(value: unknown): boolean | null {
  return value === 1 || value === "1" ? true : value === 0 || value === "0" ? false : null;
}

function status(
  state: BuildingSourceStatus["state"],
  sourceName: string,
  refreshedAt: string | null,
  association: BuildingDataAssociation = "direct",
): BuildingSourceStatus {
  return { state, provenance: { sourceName, refreshedAt, association } };
}

async function freshness(index: string): Promise<string | null> {
  return getIndexFreshness(index).catch(() => null);
}

async function optional<T>(load: () => Promise<T>, fallback: T): Promise<{ data: T; ready: boolean }> {
  try {
    return { data: await load(), ready: true };
  } catch {
    return { data: fallback, ready: false };
  }
}

async function searchByBuilding<T>(search: SearchClient, index: string, code: string, limit: number): Promise<T[]> {
  const result = await search.index(index).search("", { filter: `building_code = '${code}'`, limit });
  return result.hits as T[];
}

function buildingProfile(feature: BuildingFeature): BuildingProfile | null {
  const summary = buildingFromFeature(feature);
  if (!summary) return null;
  const properties = feature.properties ?? {};
  return {
    ...summary,
    secondaryUsage: text(properties.BLDG_SEC_USAGE),
    neighbourhood: text(properties.NEIGHBOURHOOD),
    jurisdiction: text(properties.JURISDICTION),
    propertyType: text(properties.PROPERTY_TYPE),
    hasSubbuildings: booleanFlag(properties.HAS_SUBBLDGS),
    managingOrganization: text(properties.MANAGE_ORG),
    maintenanceOrganization: text(properties.BLDG_MAINTENANCE),
    constructionStatus: text(properties.CONSTR_STATUS),
    constructionType: text(properties.CONSTR_TYPE),
    occupancyDate: text(properties.OCCU_DATE),
    grossAreaSquareMeters: number(properties.GBA),
    form: text(properties.BLDG_FORM),
    condition: text(properties.BLDG_CONDITION),
    greenStatus: text(properties.GREEN_STATUS),
  };
}

function addressesForBuilding(collection: FeatureCollection, buildingUid: string): BuildingAddress[] {
  return collection.features
    .filter((feature) => {
      const properties = feature.properties ?? {};
      return properties.BLDG_UID === buildingUid && properties.STATUS === "Current";
    })
    .flatMap((feature) => {
      const properties = feature.properties ?? {};
      const fullAddress = text(properties.FULL_ADDRESS);
      if (!fullAddress) return [];
      return [
        {
          fullAddress,
          siteName: text(properties.SITE_NAME),
          primary: properties.IS_PRIMARY === 1,
          official: properties.IS_OFFICIAL_ADDRESS === 1,
          mailing: properties.IS_MAILING_ADDRESS === 1,
          pointType: text(properties.SITE_POINT_DESCRIPTOR),
        },
      ];
    })
    .sort((a, b) => Number(b.primary) - Number(a.primary) || Number(b.official) - Number(a.official));
}

function poiCardsForBuilding(
  poiCollection: FeatureCollection,
  building: BuildingFeature,
  addressIds: ReadonlySet<string>,
): PoiCard[] {
  const byId = new Map<string, PoiCard>();
  for (const feature of poiCollection.features) {
    const properties = feature.properties ?? {};
    const transformed = transformPoi(feature as unknown as Record<string, unknown>);
    if (!transformed) continue;
    const direct = addressIds.has(String(properties.ADD_ID ?? ""));
    const coordinates = feature.geometry?.type === "Point" ? feature.geometry.coordinates : null;
    const contained = coordinates ? pointInFeature(building, [coordinates[0], coordinates[1]]) : false;
    if (!direct && !contained) continue;
    byId.set(transformed.doc.id, toPoiCard(transformed.doc, direct ? "official-address" : "location-derived"));
  }
  return [...byId.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function entranceSummaries(collection: FeatureCollection, code: string): BuildingEntranceSummary[] {
  return collection.features.flatMap((feature) => {
    if (feature.geometry?.type !== "Point") return [];
    const properties = feature.properties as {
      id?: unknown;
      buildingCode?: unknown;
      entranceType?: unknown;
      doorCount?: unknown;
    } | null;
    const [longitude, latitude] = feature.geometry.coordinates;
    if (
      String(properties?.buildingCode ?? "").toUpperCase() !== code ||
      typeof properties?.id !== "string" ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude)
    ) {
      return [];
    }
    return [
      {
        id: properties.id,
        entranceType: text(properties.entranceType),
        doorCount: number(properties.doorCount),
        position: [longitude, latitude] as [number, number],
      },
    ];
  });
}

function sourceAllowed(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "learningspaces.ubc.ca" || parsed.hostname.endsWith(".ubc.ca"))
    );
  } catch {
    return false;
  }
}

function photosFromRooms(buildingName: string, rooms: RoomCard[]): OfficialBuildingPhoto[] {
  const seen = new Set<string>();
  const photos: OfficialBuildingPhoto[] = [];
  for (const room of rooms) {
    if (!sourceAllowed(room.link) || seen.has(room.link as string)) continue;
    seen.add(room.link as string);
    photos.push({
      url: `/api/preview?url=${encodeURIComponent(room.link as string)}`,
      alt: `${room.name} in ${buildingName}`,
      sourceUrl: room.link as string,
      sourceName: "UBC Learning Spaces",
      classification: "ubc-hosted",
    });
    if (photos.length === 6) break;
  }
  return photos;
}

export function availabilityFreshness(asOf: string | null, now: Date): BuildingDataFreshness {
  if (!asOf) return "unknown";
  const collected = new Date(asOf);
  if (!Number.isFinite(collected.getTime())) return "unknown";
  return now.getTime() - collected.getTime() > DAY_MS ? "historical" : "current";
}

/** Summarizes the latest available intervals without presenting a stale snapshot as live. */
export function summarizeAvailability(
  libRooms: LibRoomDoc[],
  intervals: AvailabilityDoc[],
  now: Date,
): { as_of: string | null; freshness: BuildingDataFreshness; rooms: AvailabilityRoomCard[] } | null {
  if (libRooms.length === 0 || intervals.length === 0) return null;
  const today = now.toLocaleDateString("en-CA");
  const dates = [...new Set(intervals.map((interval) => interval.date).filter(Boolean))] as string[];
  const evalDate = dates.includes(today) ? today : dates.sort().at(-1);
  if (!evalDate) return null;
  const evalNow = evalDate === today ? now : toDate(`${evalDate} 00:00`);

  const rooms = libRooms.map((room) => {
    const mine = intervals
      .filter((interval) => interval.eid === room.eid && interval.date === evalDate)
      .sort((a, b) => a.start.localeCompare(b.start));
    const freeNow = mine.find(
      (interval) =>
        interval.state === "free" &&
        toDate(interval.start) <= evalNow &&
        (!interval.end || evalNow <= toDate(interval.end)),
    );
    const nextFree = mine.find((interval) => interval.state === "free" && toDate(interval.start) > evalNow);
    return {
      title: room.title,
      capacity: room.capacity,
      url: room.url,
      thumbnail: room.thumbnail ? (room.thumbnail.startsWith("//") ? `https:${room.thumbnail}` : room.thumbnail) : null,
      freeNow: Boolean(freeNow),
      freeUntil: freeNow ? hhmm(freeNow.end) : null,
      nextFree: nextFree ? hhmm(nextFree.start) : null,
    };
  });
  const as_of = intervals.find((interval) => interval.collected_at)?.collected_at ?? null;
  return { as_of, freshness: availabilityFreshness(as_of, now), rooms };
}

export function toRoomCard(doc: StudySpaceDoc): RoomCard {
  return {
    name: doc.name ?? doc.title,
    roomNumber: doc.room_number,
    spaceType: doc.space_type,
    capacity: doc.capacity,
    floor: doc.floor,
    layout: doc.layout,
    furniture: doc.furniture,
    photo: null,
    link: doc.link,
  };
}

export function toPoiCard(doc: PoiDoc, association: PoiCard["association"]): PoiCard {
  return {
    name: doc.name,
    service_type: doc.service_type,
    url: doc.url,
    photo: sourceAllowed(doc.photo) ? doc.photo : null,
    hours: doc.hours,
    contact: doc.contact,
    association,
  };
}

/** Loads one complete public building record while preserving independent source failures. */
export async function loadBuildingDetails(search: SearchClient, query: string, now: Date): Promise<BuildingDetails> {
  const resolved = await resolveBuilding(search, query);
  const buildingsCollection = await getBuildingsGeoJson();
  const feature = buildingsCollection.features.find(
    (candidate) => String(candidate.properties?.BLDG_CODE ?? "").toUpperCase() === resolved.code,
  ) as BuildingFeature | undefined;
  const building = feature && buildingProfile(feature);
  if (!feature || !building) throw new Error(`Unknown building: "${query}"`);
  const buildingUid = String(feature.properties?.BLDG_UID ?? "");

  const [addressResult, roomResult, availabilityResult, poiResult, entranceResult, timestamps] = await Promise.all([
    optional(() => dataStore().getJson(ADDRESS_KEY) as Promise<FeatureCollection>, {
      type: "FeatureCollection",
      features: [],
    } as FeatureCollection),
    optional(() => searchByBuilding<StudySpaceDoc>(search, "study_spaces", building.code, 500), []),
    optional(async () => {
      const [rooms, intervals] = await Promise.all([
        searchByBuilding<LibRoomDoc>(search, "lib_rooms", building.code, 100),
        searchByBuilding<AvailabilityDoc>(search, "room_availability", building.code, 2000),
      ]);
      return summarizeAvailability(rooms, intervals, now);
    }, null),
    optional(() => dataStore().getJson(POI_KEY) as Promise<FeatureCollection>, {
      type: "FeatureCollection",
      features: [],
    } as FeatureCollection),
    optional(() => getPublicEntrancesGeoJson(), { type: "FeatureCollection", features: [] } as FeatureCollection),
    Promise.all([freshness("buildings"), freshness("study_spaces"), freshness("room_availability"), freshness("poi")]),
  ]);

  const addresses = addressesForBuilding(addressResult.data, buildingUid);
  const addressIds = new Set(
    addressResult.data.features.flatMap((candidate) => {
      const properties = candidate.properties ?? {};
      return properties.BLDG_UID === buildingUid && properties.ADD_UID ? [String(properties.ADD_UID)] : [];
    }),
  );
  const rooms = roomResult.data.map(toRoomCard);
  const pois = poiResult.ready ? poiCardsForBuilding(poiResult.data, feature, addressIds) : [];
  const entrances = entranceResult.ready ? entranceSummaries(entranceResult.data, building.code) : [];
  const [buildingRefreshedAt, roomRefreshedAt, availabilityRefreshedAt, poiRefreshedAt] = timestamps;

  return {
    code: building.code,
    name: building.name,
    building,
    addresses,
    rooms,
    pois,
    entrances,
    photos: photosFromRooms(building.name, rooms),
    availability: availabilityResult.data,
    sourceStatus: {
      building: status("ready", "UBC Geospatial Buildings", buildingRefreshedAt),
      addresses: status(addressResult.ready ? "ready" : "unavailable", "UBC Geospatial Addresses", buildingRefreshedAt),
      rooms: status(roomResult.ready ? "ready" : "unavailable", "UBC Learning Spaces", roomRefreshedAt),
      availability: status(
        availabilityResult.ready ? "ready" : "unavailable",
        "UBC Library Room Bookings",
        availabilityRefreshedAt,
      ),
      pois: status(
        poiResult.ready ? "ready" : "unavailable",
        "UBC Geospatial Points of Interest",
        poiRefreshedAt,
        "location-derived",
      ),
      entrances: status(
        entranceResult.ready ? "ready" : "unavailable",
        "UBC Geospatial Building Entrances",
        buildingRefreshedAt,
      ),
    },
  };
}
