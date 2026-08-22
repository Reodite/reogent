import type { DatasetModule } from "../core/types";

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

/** Bookable library room (LibCal catalog) — joins room_availability by eid. */
export interface LibRoomDoc {
  eid: number;
  building_code: string | null;
  location: string | null;
  title: string;
  capacity: number | null;
  url: string | null;
  thumbnail: string | null;
}

export interface AvailabilityDoc {
  eid: number;
  location: string | null; // the library publishing the space
  building_code: string | null;
  room: string;
  capacity: number | null;
  state: "free" | "booked" | "unavailable";
  date: string | null;
  start: string;
  end: string | null;
  minutes: number | null;
  collected_at: string | null; // snapshot time — always surface as "as of"
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

function transformLibRoom(row: Row): { id: string; doc: LibRoomDoc } | null {
  if (row.eid == null || !row.title) return null;
  return {
    id: String(row.eid),
    doc: {
      eid: row.eid,
      building_code: row.building_code ?? null,
      location: row.location ?? null,
      title: String(row.title),
      capacity: typeof row.capacity === "number" ? row.capacity : null,
      url: row.url ?? null,
      thumbnail: row.thumbnail ?? null,
    },
  };
}

export function transformAvailability(row: Row): { id: string; doc: AvailabilityDoc } | null {
  if (row.eid == null || !row.room || !row.start || !row.state) return null;
  return {
    id: `${row.eid}#${row.start}`,
    doc: {
      eid: row.eid,
      location: row.location ?? null,
      building_code: row.building_code ?? null,
      room: String(row.room),
      capacity: typeof row.capacity === "number" ? row.capacity : null,
      state: row.state,
      date: row.date ?? null,
      start: String(row.start),
      end: row.end != null ? String(row.end) : null,
      minutes: typeof row.minutes === "number" ? row.minutes : null,
      collected_at: row.collected_at ?? null,
    },
  };
}

const asOf = (rows: AvailabilityDoc[]) => rows.find((r) => r.collected_at)?.collected_at ?? null;

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
    {
      index: "lib_rooms",
      settings: {
        searchableAttributes: ["title", "location"],
        filterableAttributes: ["building_code", "capacity", "eid"],
      },
      async *read(store) {
        yield* (await store.getJson("room-bookings/rooms.json")) as Row[];
      },
      transform: transformLibRoom,
    },
    {
      index: "room_availability",
      settings: {
        searchableAttributes: ["room", "location"],
        filterableAttributes: ["state", "minutes", "capacity", "date", "eid"],
        sortableAttributes: ["start", "capacity"],
      },
      async *read(store) {
        yield* (await store.getJson("room-bookings/availability.json")) as Row[];
      },
      transform: transformAvailability,
    },
  ],
  tools: [
    {
      spec: {
        name: "find_study_spaces",
        description:
          "Find places to study at UBC: informal study spaces/classrooms (kind 'informal') or bookable library rooms that are free right now (kind 'bookable', from the latest snapshot — always tell the user the as_of time). Pass a specific bookable room name to get its full booking timeline. Filter by building, capacity, and minimum free stretch.",
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
              min_minutes: { type: "number", description: "Bookable only: minimum free stretch in minutes" },
              room: { type: "string", description: 'A specific bookable room, e.g. "IKB 461"; returns its timeline' },
              date: { type: "string", description: "Optional ISO date filter for a room timeline, e.g. 2026-08-06" },
              limit: { type: "number", description: "Max results (default 10)" },
            },
            required: [],
          },
        },
      },
      async execute(input, search) {
        const room = input.room ? String(input.room) : "";
        const filters: string[] = [];
        if (input.building) filters.push(`building_code = '${String(input.building).toUpperCase()}'`);

        // Room timeline mode.
        if (room) {
          const tfilters: string[] = [...filters];
          if (input.date) tfilters.push(`date = '${String(input.date)}'`);
          const res = await search.index("room_availability").search(room, {
            filter: tfilters.length > 0 ? tfilters.join(" AND ") : undefined,
            sort: ["start:asc"],
            limit: 100,
          });
          const rows = res.hits as unknown as AvailabilityDoc[];
          if (rows.length === 0) throw new Error(`No library room matched "${room}" in the latest snapshot`);
          return {
            kind: "schedule",
            room: rows[0].room,
            location: rows[0].location,
            as_of: asOf(rows),
            intervals: rows.map(({ state, date, start, end, minutes }) => ({ state, date, start, end, minutes })),
          };
        }

        const kind = String(input.kind ?? "informal");

        // Informal study spaces / classrooms.
        if (kind === "informal") {
          const ifilters: string[] = [...filters];
          if (input.space_type) ifilters.push(`space_type = '${String(input.space_type)}'`);
          if (input.min_capacity !== undefined) ifilters.push(`capacity >= ${Number(input.min_capacity)}`);
          const res = await search.index("study_spaces").search(input.query ? String(input.query) : "", {
            filter: ifilters.length > 0 ? ifilters.join(" AND ") : undefined,
            sort: ["capacity:desc"],
            limit: Math.min(Number(input.limit) || 10, 30),
          });
          const hits = res.hits;
          if (hits.length === 0) throw new Error("No study spaces matched those filters");
          return { kind: "informal", spaces: hits as unknown as StudySpaceDoc[] };
        }

        // Bookable library rooms free now.
        const bfilters: string[] = ["state = 'free'", ...filters];
        if (input.min_minutes !== undefined) bfilters.push(`minutes >= ${Number(input.min_minutes)}`);
        if (input.min_capacity !== undefined) bfilters.push(`capacity >= ${Number(input.min_capacity)}`);
        const res = await search.index("room_availability").search(input.query ? String(input.query) : "", {
          filter: bfilters.join(" AND "),
          sort: ["capacity:desc"],
          limit: Math.min(Number(input.limit) || 20, 30),
        });
        const rows = res.hits as unknown as AvailabilityDoc[];
        if (rows.length === 0) throw new Error("No free library rooms matched those filters in the latest snapshot");
        return { kind: "bookable", as_of: asOf(rows), rooms: rows };
      },
    },
  ],
};
