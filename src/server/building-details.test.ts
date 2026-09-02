import { pointInFeature, type BuildingFeature } from "@/src/lib/geo";
import { summarizeAvailability, toPoiCard } from "@/src/server/building-details";
import type { AvailabilityDoc, LibRoomDoc } from "@/src/server/modules/spaces";
import { describe, expect, it } from "vitest";

const room = (eid: number, title: string): LibRoomDoc => ({
  eid,
  building_code: "IKB",
  location: "IKB",
  title,
  capacity: 6,
  url: "https://libcal.example/r",
  thumbnail: null,
});

const interval = (
  eid: number,
  date: string,
  start: string,
  end: string,
  state: AvailabilityDoc["state"],
): AvailabilityDoc => ({
  eid,
  location: "IKB",
  building_code: "IKB",
  room: `room ${eid}`,
  capacity: 6,
  state,
  date,
  start: `${date} ${start}`,
  end: `${date} ${end}`,
  minutes: 60,
  collected_at: "2026-08-06T10:00:00Z",
});

describe("summarizeAvailability", () => {
  const now = new Date("2026-08-06T12:30:00");

  it("computes freeNow/freeUntil and nextFree against today's intervals", () => {
    const out = summarizeAvailability(
      [room(1, "Room A"), room(2, "Room B")],
      [
        interval(1, "2026-08-06", "12:00", "14:00", "free"),
        interval(2, "2026-08-06", "12:00", "14:00", "booked"),
        interval(2, "2026-08-06", "15:00", "16:00", "free"),
      ],
      now,
    );
    expect(out?.as_of).toBe("2026-08-06T10:00:00Z");
    expect(out?.freshness).toBe("current");
    expect(out?.rooms).toEqual([
      expect.objectContaining({ title: "Room A", freeNow: true, freeUntil: "14:00" }),
      expect.objectContaining({ title: "Room B", freeNow: false, nextFree: "15:00" }),
    ]);
  });

  it("labels an old snapshot as historical", () => {
    const out = summarizeAvailability(
      [room(1, "Room A")],
      [
        { ...interval(1, "2026-08-01", "09:00", "10:00", "free"), collected_at: "2026-08-03T08:00:00Z" },
        { ...interval(1, "2026-08-03", "11:00", "12:00", "free"), collected_at: "2026-08-03T08:00:00Z" },
      ],
      now,
    );
    // Evaluates the latest snapshot day from midnight when today's date is absent.
    expect(out?.rooms[0]).toEqual(expect.objectContaining({ freeNow: false, nextFree: "11:00" }));
    expect(out?.freshness).toBe("historical");
  });

  it("returns null without rooms or intervals", () => {
    expect(summarizeAvailability([], [interval(1, "2026-08-06", "09:00", "10:00", "free")], now)).toBeNull();
    expect(summarizeAvailability([room(1, "A")], [], now)).toBeNull();
  });
});

describe("POI links", () => {
  it("omits non-HTTPS links before labeling a service website", () => {
    expect(
      toPoiCard(
        {
          id: "1",
          name: "Test service",
          abbreviation: null,
          service_type: "service",
          url: "http://example.com",
          contact: null,
          hours: null,
          photo: null,
          lat: 49.26,
          lon: -123.25,
        },
        "location-derived",
      ).url,
    ).toBeNull();
  });
});

describe("pointInFeature", () => {
  const square: BuildingFeature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
        // hole in the middle
        [
          [0.8, 0.8],
          [1.2, 0.8],
          [1.2, 1.2],
          [0.8, 1.2],
          [0.8, 0.8],
        ],
      ],
    },
  };

  it("is inside the ring, outside the bounds, and excluded from holes", () => {
    expect(pointInFeature(square, [0.5, 0.5])).toBe(true);
    expect(pointInFeature(square, [3, 1])).toBe(false);
    expect(pointInFeature(square, [1, 1])).toBe(false); // inside the hole
  });
});
