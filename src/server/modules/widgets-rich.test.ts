import type { BuildingDetails } from "@/src/lib/api-types";
import type { SearchClient } from "@/src/server/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadBuildingDetails = vi.hoisted(() => vi.fn());
vi.mock("@/src/server/building-details", () => ({ loadBuildingDetails }));

const { createWidgetsModule } = await import("./widgets");

const details = {
  code: "IBLC",
  name: "Irving K. Barber Learning Centre",
  building: {
    code: "IBLC",
    name: "Irving K. Barber Learning Centre",
    shortName: "I.K. Barber",
    aliases: ["IKB"],
    address: "1961 East Mall",
    postalCode: "V6T 1Z1",
    usage: "Academic",
    state: "Occupied",
    floors: 5,
    heightMeters: 26.87,
    centroid: [-123.252, 49.267],
  },
  addresses: [],
  rooms: [{ name: "IBLC 100" }, { name: "IBLC 101" }],
  pois: [{ name: "Help desk" }],
  entrances: [{ id: "IBLC-1" }],
  photos: [],
  availability: { as_of: "2026-08-11T08:33:32Z", freshness: "historical", rooms: [{ title: "Room 1" }] },
  sourceStatus: {
    building: { state: "ready" },
    rooms: { state: "ready" },
    availability: { state: "ready" },
    pois: { state: "ready" },
    entrances: { state: "ready" },
  },
} as unknown as BuildingDetails;

function search(exact = true): SearchClient {
  return {
    index: () => ({
      getDocument: vi.fn(async (code: string) => {
        if (!exact) throw new Error("missing");
        return { id: code, code, name: details.name, aliases: [], lat: 49.267, lon: -123.252 };
      }),
      search: vi.fn(),
    }),
  } as unknown as SearchClient;
}

beforeEach(() => {
  loadBuildingDetails.mockReset().mockResolvedValue(details);
});

describe("rich building widgets", () => {
  const tool = createWidgetsModule().tools[0];

  it("preserves the legacy building widget contract", async () => {
    const output = (await tool.execute({ type: "building", buildings: ["IBLC"] }, search())) as {
      type: string;
      result: { code: string; rooms?: unknown };
    };

    expect(output).toMatchObject({ type: "building", result: { code: "IBLC" } });
    expect(output.result.rooms).toBeUndefined();
    expect(loadBuildingDetails).not.toHaveBeenCalled();
  });

  it.each(["building_detail", "building_entrances", "building_spaces"])(
    "loads %s from one exact resolved code",
    async (type) => {
      const output = (await tool.execute({ type, building_code: "iblc" }, search())) as {
        type: string;
        result: { building: { code: string } };
      };

      expect(output.type).toBe(type);
      expect(output.result.building.code).toBe("IBLC");
      expect(loadBuildingDetails).toHaveBeenCalledWith(expect.anything(), "IBLC", expect.any(Date));
    },
  );

  it("reports full room totals when a spaces payload is bounded", async () => {
    const output = (await tool.execute({ type: "building_spaces", building_code: "IBLC" }, search())) as {
      result: { rooms: unknown[]; room_count?: number; rooms_truncated?: boolean; bookable_room_count?: number };
    };

    expect(output.result.room_count).toBe(2);
    expect(output.result.bookable_room_count).toBe(1);
    expect(output.result.rooms_truncated).toBe(false);
  });

  it("rejects missing and unresolved exact codes", async () => {
    await expect(tool.execute({ type: "building_detail" }, search())).rejects.toThrow(/require building_code/);
    await expect(tool.execute({ type: "building_detail", building_code: "NOPE" }, search(false))).rejects.toThrow(
      /Unknown exact building code/,
    );
    expect(loadBuildingDetails).not.toHaveBeenCalled();
  });
});
