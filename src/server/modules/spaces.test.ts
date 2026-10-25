import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchClient } from "../core/types";
import { mergeSlots, spaces } from "./spaces";

vi.mock("../data", () => ({
  dataStore: () => ({
    async getJson(key: string) {
      if (key === "room-bookings/locations.json") {
        return [{ lid: "1788", name: "Koerner Library", building_code: "KLIB" }];
      }
      if (key === "room-bookings/rooms.json") {
        return [
          { eid: 1, lid: "1788", location: "Koerner Library", title: "167", capacity: 8, url: null },
          { eid: 2, lid: "1788", location: "Koerner Library", title: "216", capacity: 4, url: null },
        ];
      }
      throw new Error(`unexpected key ${key}`);
    },
  }),
}));

const slot = (itemId: number, start: string, end: string, className?: string) => ({
  itemId,
  start: `2026-10-26 ${start}:00`,
  end: `2026-10-26 ${end}:00`,
  ...(className ? { className } : {}),
});

afterEach(() => vi.unstubAllGlobals());

describe("mergeSlots", () => {
  it("collapses consecutive same-state slots and treats unknown classes as unavailable", () => {
    expect(
      mergeSlots([
        slot(1, "10:15", "10:30"),
        slot(1, "10:00", "10:15"),
        slot(1, "10:30", "10:45", "s-lc-eq-checkout"),
        slot(1, "10:45", "11:00", "something-new"),
      ]),
    ).toEqual([
      { state: "free", start: "2026-10-26 10:00:00", end: "2026-10-26 10:30:00", minutes: 30 },
      { state: "booked", start: "2026-10-26 10:30:00", end: "2026-10-26 10:45:00", minutes: 15 },
      { state: "unavailable", start: "2026-10-26 10:45:00", end: "2026-10-26 11:00:00", minutes: 15 },
    ]);
  });
});

describe("find_study_spaces bookable mode", () => {
  const tool = spaces.tools.find((t) => t.spec.name === "find_study_spaces")!;
  const search = {} as SearchClient;

  function stubGrid() {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({
        slots: [
          slot(1, "10:00", "10:15"),
          slot(1, "10:15", "10:30"),
          slot(1, "10:30", "10:45"),
          slot(1, "10:45", "11:00"),
          slot(2, "10:00", "10:15", "s-lc-eq-checkout"),
          slot(2, "10:15", "10:30"),
          { ...slot(1, "00:00", "00:15"), start: "2026-10-27 00:00:00", end: "2026-10-27 00:15:00" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("reads the live grid and returns rooms with long enough free stretches", async () => {
    const fetchMock = stubGrid();
    const out = (await tool.execute({ kind: "bookable", date: "2026-10-26", min_minutes: 30 }, search)) as {
      kind: string;
      rooms: { room: string; free: unknown[] }[];
    };
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://libcal.library.ubc.ca/spaces/availability/grid");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toMatchObject({
      lid: "1788",
      start: "2026-10-26",
      end: "2026-10-27",
    });
    expect(out.kind).toBe("bookable");
    expect(out.rooms).toEqual([
      expect.objectContaining({
        room: "167",
        location: "Koerner Library",
        free: [{ start: "2026-10-26 10:00:00", end: "2026-10-26 11:00:00", minutes: 60 }],
      }),
    ]);
  });

  it("returns one room's timeline", async () => {
    stubGrid();
    const out = (await tool.execute({ room: "koerner 216", date: "2026-10-26" }, search)) as {
      kind: string;
      room: string;
      intervals: { state: string }[];
    };
    expect(out).toMatchObject({ kind: "schedule", room: "216" });
    expect(out.intervals.map((i) => i.state)).toEqual(["booked", "free"]);
  });

  it("rejects malformed dates before fetching", async () => {
    const fetchMock = stubGrid();
    await expect(tool.execute({ kind: "bookable", date: "tomorrow" }, search)).rejects.toThrow(/YYYY-MM-DD/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
