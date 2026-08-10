import { pointInFeature, type BuildingFeature } from "@/src/lib/geo";
import { summarizeAvailability } from "@/src/server/building-details";
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
    expect(out?.rooms).toEqual([
      expect.objectContaining({ title: "Room A", freeNow: true, freeUntil: "14:00" }),
      expect.objectContaining({ title: "Room B", freeNow: false, nextFree: "15:00" }),
    ]);
  });

  it("falls back to the latest snapshot date when today is absent", () => {
    const out = summarizeAvailability(
      [room(1, "Room A")],
      [interval(1, "2026-08-01", "09:00", "10:00", "free"), interval(1, "2026-08-03", "11:00", "12:00", "free")],
      now,
    );
    // Evaluated at the start of 2026-08-03: not free "now", next free at 11:00.
    expect(out?.rooms[0]).toEqual(expect.objectContaining({ freeNow: false, nextFree: "11:00" }));
  });

  it("returns null without rooms or intervals", () => {
    expect(summarizeAvailability([], [interval(1, "2026-08-06", "09:00", "10:00", "free")], now)).toBeNull();
    expect(summarizeAvailability([room(1, "A")], [], now)).toBeNull();
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
