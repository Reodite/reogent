import type { DatasetModule, SearchClient } from "../core/types";
import { dataStore } from "../data";
import { liveJson } from "../live";
import { resolveBuilding } from "./buildings";

export interface StudySpaceDoc {
  id: string;
  title: string;
  name: string | null; // short label, e.g. "AERL 120"
  building_code: string | null;
  building_name: string | null;
  room_number: string | null;
  capacity: number | null;
  space_type: string | null; // "classroom" | "study space"
  furniture: string | null;
  layout: string | null;
  floor: number | null;
  photo: string | null; // cover thumbnail (signed URL — may go stale; the preview proxy refreshes from `link`)
  link: string | null; // Find a Space room page
}

// biome-ignore lint/suspicious/noExplicitAny: raw dataset rows
type Row = Record<string, any>;

export function transformStudySpace(row: Row): { id: string; doc: StudySpaceDoc } | null {
  if (row.id == null || !row.Title) return null;
  const capacity = Number(row.Capacity); // source carries it as a string
  const floor = Number(row.floor);
  return {
    id: String(row.id),
    doc: {
      id: String(row.id),
      title: String(row.Title),
      name: row.Name != null ? String(row.Name) : null,
      building_code: row["Building Code"] ?? null,
      building_name: row["Buildings - Building Name (override)"] ?? row["Buildings - Building Name"] ?? null,
      room_number: row["Room Number"] != null ? String(row["Room Number"]) : null,
      capacity: Number.isFinite(capacity) ? capacity : null,
      space_type: row.space_type ?? null,
      furniture: row.Formatted_Furniture ?? null,
      layout: row.Formatted_Room_Layout_Type ?? null,
      floor: Number.isFinite(floor) ? floor : null,
      photo: row.cover_photo_thumbnail_url ?? null,
      link: row["Room Link"] ?? null,
    },
  };
}

const LIBCAL = "https://libcal.library.ubc.ca";
const GRID_TTL_MS = 2 * 60_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type SlotState = "free" | "booked" | "unavailable";

// The class LibCal puts on a slot. A bare slot is bookable; unknown classes
// count as unavailable so a room in use is never reported free.
const SLOT_STATES: Record<string, SlotState> = {
  "": "free",
  free: "free",
  "s-lc-eq-checkout": "booked",
  "s-lc-eq-r-unavailable": "unavailable",
};

interface LibLocation {
  lid: string;
  name: string;
  building_code: string | null;
}

interface LibRoom {
  eid: number;
  lid: string;
  location: string;
  building_code: string | null;
  grouping: string | null;
  title: string;
  capacity: number | null;
  url: string;
}

/** One uninterrupted stretch of a room in one state; times are Vancouver-local `YYYY-MM-DD HH:MM:SS`. */
export interface RoomInterval {
  state: SlotState;
  start: string;
  end: string;
  minutes: number;
}

let catalogPromise: Promise<{ locations: LibLocation[]; rooms: Map<number, LibRoom> }> | undefined;

// LibCal's room list changes rarely, so names and capacities come from the
// collected catalog while availability is read live.
function libraryCatalog() {
  catalogPromise ??= Promise.all([
    dataStore().getJson("room-bookings/locations.json") as Promise<Row[]>,
    dataStore().getJson("room-bookings/rooms.json") as Promise<Row[]>,
  ]).then(
    ([locations, rooms]) => ({
      locations: locations.map((l) => ({
        lid: String(l.lid),
        name: String(l.name),
        building_code: l.building_code ?? null,
      })),
      rooms: new Map(
        rooms
          .filter((r) => r.eid != null && r.title)
          .map((r) => [
            Number(r.eid),
            {
              eid: Number(r.eid),
              lid: String(r.lid),
              location: String(r.location),
              building_code: r.building_code ?? null,
              grouping: r.grouping ?? null,
              title: String(r.title),
              capacity: typeof r.capacity === "number" ? r.capacity : null,
              url: r.url ?? `${LIBCAL}/space/${r.eid}`,
            },
          ]),
      ),
    }),
    (error) => {
      catalogPromise = undefined;
      throw error;
    },
  );
  return catalogPromise;
}

const minutesBetween = (start: string, end: string) =>
  Math.round((Date.parse(end.replace(" ", "T")) - Date.parse(start.replace(" ", "T"))) / 60_000);

/** Merges a room's 15-minute grid slots into intervals, collapsing consecutive slots in the same state. */
export function mergeSlots(slots: { start: string; end: string; className?: string | null }[]): RoomInterval[] {
  const intervals: RoomInterval[] = [];
  for (const slot of [...slots].sort((a, b) => a.start.localeCompare(b.start))) {
    const state = SLOT_STATES[slot.className ?? ""] ?? "unavailable";
    const last = intervals.at(-1);
    if (last && last.state === state && last.end === slot.start) {
      last.end = slot.end;
      last.minutes = minutesBetween(last.start, last.end);
    } else {
      intervals.push({ state, start: slot.start, end: slot.end, minutes: minutesBetween(slot.start, slot.end) });
    }
  }
  return intervals;
}

interface GridSlot {
  itemId: number;
  start: string;
  end: string;
  className?: string;
}

/** Live LibCal availability for one day at the given locations, keyed by room eid. Today starts at the current slot. */
async function dayTimelines(lids: string[], date: string): Promise<Map<number, RoomInterval[]>> {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const payloads = await Promise.all(
    lids.map(
      (lid) =>
        liveJson(`${LIBCAL}/spaces/availability/grid`, GRID_TTL_MS, {
          method: "POST",
          body: new URLSearchParams({
            lid,
            gid: "0",
            eid: "-1",
            seat: "0",
            seatId: "0",
            zone: "0",
            start: date,
            end: next.toISOString().slice(0, 10),
            pageIndex: "0",
            pageSize: "500",
          }).toString(),
          headers: {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-requested-with": "XMLHttpRequest",
            referer: `${LIBCAL}/spaces?lid=${lid}`,
          },
        }) as Promise<{ slots?: GridSlot[] }>,
    ),
  );
  const byRoom = new Map<number, GridSlot[]>();
  for (const slot of payloads.flatMap((p) => p.slots ?? [])) {
    if (!slot.start.startsWith(date)) continue;
    byRoom.set(slot.itemId, [...(byRoom.get(slot.itemId) ?? []), slot]);
  }
  return new Map([...byRoom].map(([eid, slots]) => [eid, mergeSlots(slots)]));
}

const vancouverToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver" }).format(new Date());

const words = (value: string) => value.toLowerCase().split(/\s+/).filter(Boolean);

function roomMatches(room: LibRoom, query: string): boolean {
  const haystack = `${room.location} ${room.grouping ?? ""} ${room.title}`.toLowerCase();
  return words(query).every((word) => haystack.includes(word));
}

/** Bookable-room mode of find_study_spaces: rooms with free stretches on a date, or one room's timeline. */
async function bookableRooms(input: Record<string, unknown>, search: SearchClient) {
  const date = input.date === undefined ? vancouverToday() : String(input.date);
  if (!ISO_DATE.test(date)) throw new Error("date must be YYYY-MM-DD");
  const { locations, rooms } = await libraryCatalog();
  let scope = locations;
  if (input.building) {
    const building = await resolveBuilding(search, String(input.building)).catch(() => null);
    const code = building?.code ?? String(input.building).toUpperCase();
    scope = locations.filter((l) => l.building_code === code);
    if (scope.length === 0) {
      const codes = [...new Set(locations.map((l) => l.building_code).filter(Boolean))].join(", ");
      throw new Error(`No bookable library rooms in ${code}. Libraries with bookable rooms are in: ${codes}`);
    }
  }
  const timelines = await dayTimelines(
    scope.map((l) => l.lid),
    date,
  );
  if (timelines.size === 0) {
    throw new Error(`LibCal publishes no availability for ${date}; bookings open about two weeks ahead`);
  }
  // Rooms added after the catalog was collected still show, labelled by id.
  const describe = (eid: number): LibRoom =>
    rooms.get(eid) ?? {
      eid,
      lid: "",
      location: scope.length === 1 ? scope[0].name : "UBC Library",
      building_code: scope.length === 1 ? scope[0].building_code : null,
      grouping: null,
      title: `Space ${eid}`,
      capacity: null,
      url: `${LIBCAL}/space/${eid}`,
    };
  const fetched_at = new Date().toISOString();

  if (input.room) {
    const wanted = String(input.room);
    const eid = [...timelines.keys()].find((id) => roomMatches(describe(id), wanted));
    if (eid === undefined) throw new Error(`No bookable library room matched "${wanted}"`);
    const room = describe(eid);
    return {
      kind: "schedule",
      fetched_at,
      date,
      room: room.title,
      location: room.location,
      capacity: room.capacity,
      url: room.url,
      intervals: timelines.get(eid),
    };
  }

  const minMinutes = input.min_minutes === undefined ? 30 : Number(input.min_minutes);
  const minCapacity = input.min_capacity === undefined ? 0 : Number(input.min_capacity);
  const query = input.query ? String(input.query) : "";
  const found = [...timelines]
    .map(([eid, intervals]) => ({
      room: describe(eid),
      free: intervals.filter((i) => i.state === "free" && i.minutes >= minMinutes),
    }))
    .filter(
      ({ room, free }) =>
        free.length > 0 && (room.capacity ?? 0) >= minCapacity && (!query || roomMatches(room, query)),
    )
    .sort((a, b) => a.free[0].start.localeCompare(b.free[0].start) || (b.room.capacity ?? 0) - (a.room.capacity ?? 0))
    .slice(0, Math.min(Number(input.limit) || 20, 30));
  if (found.length === 0) {
    throw new Error(`No library rooms have ${minMinutes}+ free minutes on ${date} with those filters`);
  }
  return {
    kind: "bookable",
    fetched_at,
    date,
    rooms: found.map(({ room, free }) => ({
      eid: room.eid,
      room: room.title,
      location: room.location,
      building_code: room.building_code,
      capacity: room.capacity,
      url: room.url,
      free: free.slice(0, 4).map(({ start, end, minutes }) => ({ start, end, minutes })),
    })),
  };
}

export const spaces: DatasetModule = {
  name: "spaces",
  indices: [
    {
      index: "study_spaces",
      settings: {
        searchableAttributes: ["title", "name", "building_name"],
        filterableAttributes: ["building_code", "space_type", "capacity"],
        sortableAttributes: ["capacity"],
      },
      async *read(store) {
        yield* (await store.getJson("learning-spaces/rooms.json")) as Row[];
      },
      transform: transformStudySpace,
    },
  ],
  tools: [
    {
      spec: {
        name: "find_study_spaces",
        description:
          "Find places to study at UBC. kind 'informal' (default) describes study areas and classrooms by building, keywords, space type, and capacity; it does not report occupancy. kind 'bookable' reads UBC Library room bookings (LibCal) live and returns rooms with free stretches on a date; pass room for one room's full timeline that day. Use find_building to resolve building names first. If filtering by building fails, retry with query instead of building.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: "Optional keywords for the room or building name" },
              kind: {
                type: "string",
                enum: ["informal", "bookable"],
                description: 'What to find: "informal" study spaces (default) or "bookable" library rooms',
              },
              building: { type: "string", description: 'Optional building code or name filter, e.g. "IKB", "BUCH"' },
              space_type: { type: "string", description: 'Informal only: "classroom" or "study space"' },
              min_capacity: { type: "number", description: "Minimum seat count" },
              min_minutes: {
                type: "number",
                description: "Bookable only: minimum free stretch in minutes (default 30)",
              },
              room: {
                type: "string",
                description: 'Bookable only: one room, e.g. "Koerner 167"; returns its timeline',
              },
              date: {
                type: "string",
                description:
                  "Bookable only: YYYY-MM-DD, defaults to today in America/Vancouver; about two weeks ahead at most",
              },
              limit: { type: "number", description: "Max results (default 10)" },
            },
            required: [],
          },
        },
      },
      async execute(input, search) {
        if (input.kind === "bookable" || input.room !== undefined) return bookableRooms(input, search);
        const buildingFilters: string[] = [];
        if (input.building) {
          const building = await resolveBuilding(search, String(input.building)).catch(() => null);
          buildingFilters.push(`building_code = '${building?.code ?? String(input.building).toUpperCase()}'`);
        }
        const filters: string[] = [];
        if (input.space_type) filters.push(`space_type = '${String(input.space_type)}'`);
        if (input.min_capacity !== undefined) filters.push(`capacity >= ${Number(input.min_capacity)}`);
        const text = input.query ? String(input.query) : "";
        const attempt = (filter: string[], query: string) =>
          search.index("study_spaces").search(query, {
            filter: filter.length > 0 ? filter.join(" AND ") : undefined,
            sort: ["capacity:desc"],
            limit: Math.min(Number(input.limit) || 10, 30),
          });

        // Room metadata can omit building aliases or keywords. Retry without each
        // while preserving the capacity and space-type filters.
        let result = await attempt([...filters, ...buildingFilters], text);
        if (result.hits.length === 0 && buildingFilters.length > 0) result = await attempt(filters, text);
        if (result.hits.length === 0 && text) result = await attempt([...filters, ...buildingFilters], "");
        if (result.hits.length === 0) throw new Error("No study spaces matched those filters");
        return { kind: "informal", spaces: result.hits as unknown as StudySpaceDoc[] };
      },
    },
  ],
};
