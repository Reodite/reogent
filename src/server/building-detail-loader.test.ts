import type { SearchClient } from "@/src/server/core/types";
import type { FeatureCollection } from "geojson";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveBuilding: vi.fn(),
  getBuildingsGeoJson: vi.fn(),
  getPublicEntrancesGeoJson: vi.fn(),
  getJson: vi.fn(),
  getIndexFreshness: vi.fn(),
}));

vi.mock("@/src/server/modules/buildings", () => ({
  resolveBuilding: mocks.resolveBuilding,
  getBuildingsGeoJson: mocks.getBuildingsGeoJson,
  getPublicEntrancesGeoJson: mocks.getPublicEntrancesGeoJson,
}));
vi.mock("@/src/server/data", () => ({ dataStore: () => ({ getJson: mocks.getJson }) }));
vi.mock("@/src/server/freshness", () => ({ getIndexFreshness: mocks.getIndexFreshness }));

const { loadBuildingDetails } = await import("./building-details");

const building: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-123.251, 49.259],
            [-123.249, 49.259],
            [-123.249, 49.261],
            [-123.251, 49.261],
            [-123.251, 49.259],
          ],
        ],
      },
      properties: {
        BLDG_UID: "uid-1",
        BLDG_CODE: "TEST",
        NAME: "Test Building",
        SHORTNAME: "Test",
        PRIMARY_ADDRESS: "1 Main Mall",
        POSTAL_CODE: "V6T 1Z1",
        BLDG_USAGE: "Academic",
        BLDG_SEC_USAGE: "Library",
        BLDG_STATE: "Occupied",
        NEIGHBOURHOOD: "Academic",
        JURISDICTION: "UBC",
        PROPERTY_TYPE: "FeeSimple",
        HAS_SUBBLDGS: 0,
        MANAGE_ORG: "UBC",
        BLDG_MAINTENANCE: "UBC",
        CONSTR_STATUS: "Complete",
        CONSTR_TYPE: "Concrete",
        OCCU_DATE: "20010101",
        GBA: 1200,
        BLDG_FORM: "Unspecified",
        BLDG_CONDITION: "Good",
        GREEN_STATUS: "LEED Gold",
        MAX_FLOORS: 4,
        BLDG_HEIGHT: 16,
      },
    },
  ],
};

const addresses: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-123.25, 49.259] },
      properties: {
        BLDG_UID: "uid-1",
        ADD_UID: "address-1",
        STATUS: "Current",
        FULL_ADDRESS: "1 Main Mall",
        SITE_NAME: "Test Building",
        IS_PRIMARY: 1,
        IS_OFFICIAL_ADDRESS: 1,
        IS_MAILING_ADDRESS: 1,
        SITE_POINT_DESCRIPTOR: "FrontDoor",
      },
    },
  ],
};

const pois: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-123.25, 49.26] },
      properties: {
        POI_ID: "poi-1",
        ADD_ID: "address-1",
        STATUS: "Current",
        PLACENAME: "Test Cafe",
        SERVICE_TYPE: "cafe",
        URL: "https://food.ubc.ca/test",
        PHOTOURL: "https://food.ubc.ca/test.jpg",
        HOURS: "8–4",
      },
    },
  ],
};

const entranceCollection: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-123.25, 49.259] },
      properties: { id: "TEST-1", buildingCode: "TEST", entranceType: "Primary", doorCount: 2 },
    },
  ],
};

function searchClient(failRooms = false): SearchClient {
  return {
    index: (name: string) => ({
      search: vi.fn(async () => {
        if (name === "study_spaces") {
          if (failRooms) throw new Error("rooms unavailable");
          return {
            hits: [
              {
                id: "room-1",
                title: "Test 100",
                name: "TEST 100",
                building_code: "TEST",
                building_name: "Test Building",
                room_number: "100",
                capacity: 40,
                space_type: "classroom",
                furniture: "Tables",
                layout: "Rows",
                floor: 1,
                photo: "https://expired.example/photo.jpg",
                link: "https://learningspaces.ubc.ca/classrooms/test-100",
              },
            ],
          };
        }
        if (name === "lib_rooms") {
          return {
            hits: [
              {
                eid: 1,
                building_code: "TEST",
                location: "Test",
                title: "Bookable room",
                capacity: 6,
                url: "https://libcal.library.ubc.ca/space/1",
                thumbnail: null,
              },
            ],
          };
        }
        if (name === "room_availability") {
          return {
            hits: [
              {
                eid: 1,
                location: "Test",
                building_code: "TEST",
                room: "Bookable room",
                capacity: 6,
                state: "free",
                date: "2026-08-06",
                start: "2026-08-06 12:00",
                end: "2026-08-06 14:00",
                minutes: 120,
                collected_at: "2026-08-06T10:00:00Z",
              },
            ],
          };
        }
        return { hits: [] };
      }),
      getDocument: vi.fn(),
    }),
  } as unknown as SearchClient;
}

beforeEach(() => {
  mocks.resolveBuilding
    .mockReset()
    .mockResolvedValue({ code: "TEST", name: "Test Building", aliases: [], lat: 49.26, lon: -123.25 });
  mocks.getBuildingsGeoJson.mockReset().mockResolvedValue(building);
  mocks.getPublicEntrancesGeoJson.mockReset().mockResolvedValue(entranceCollection);
  mocks.getJson.mockReset().mockImplementation(async (key: string) => (key.includes("address") ? addresses : pois));
  mocks.getIndexFreshness.mockReset().mockResolvedValue("2026-08-06T09:00:00Z");
});

describe("loadBuildingDetails", () => {
  it("assembles documented building, address, room, POI, entrance, photo, and freshness fields", async () => {
    const details = await loadBuildingDetails(searchClient(), "TEST", new Date("2026-08-06T12:30:00Z"));

    expect(details.building).toMatchObject({
      code: "TEST",
      name: "Test Building",
      secondaryUsage: "Library",
      jurisdiction: "UBC",
      propertyType: "FeeSimple",
      hasSubbuildings: false,
      grossAreaSquareMeters: 1200,
      condition: "Good",
    });
    expect(details.addresses).toEqual([
      expect.objectContaining({ fullAddress: "1 Main Mall", primary: true, official: true }),
    ]);
    expect(details.rooms).toEqual([
      expect.objectContaining({ name: "TEST 100", roomNumber: "100", spaceType: "classroom", photo: null }),
    ]);
    expect(details.pois).toEqual([
      expect.objectContaining({
        name: "Test Cafe",
        association: "official-address",
        photo: "https://food.ubc.ca/test.jpg",
      }),
    ]);
    expect(details.entrances).toEqual([
      expect.objectContaining({ id: "TEST-1", entranceType: "Primary", doorCount: 2 }),
    ]);
    expect(details.photos).toEqual([]);
    expect(details.availability).toMatchObject({ freshness: "current", rooms: [expect.any(Object)] });
    expect(details.sourceStatus.rooms.state).toBe("ready");
  });

  it("preserves successful sections when room search fails", async () => {
    const details = await loadBuildingDetails(searchClient(true), "TEST", new Date("2026-08-06T12:30:00Z"));

    expect(details.building.code).toBe("TEST");
    expect(details.rooms).toEqual([]);
    expect(details.pois).toHaveLength(1);
    expect(details.sourceStatus.rooms.state).toBe("unavailable");
  });

  it("propagates an unknown building without fabricating base details", async () => {
    mocks.resolveBuilding.mockRejectedValue(new Error('Unknown building: "NOPE"'));
    await expect(loadBuildingDetails(searchClient(), "NOPE", new Date())).rejects.toThrow("Unknown building");
  });
});
