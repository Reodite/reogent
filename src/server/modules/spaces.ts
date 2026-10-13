import type { DatasetModule } from "../core/types";
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
          "Find study areas and classrooms at UBC by building, room keywords, space type, and seating capacity. Results describe spaces; they do not report booking availability or occupancy. Use find_building to resolve building names first. If filtering by building fails, retry with query instead of building.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: "Optional keywords for the room or building name" },
              building: { type: "string", description: 'Optional building code or name filter, e.g. "IKB", "BUCH"' },
              space_type: { type: "string", description: '"classroom" or "study space"' },
              min_capacity: { type: "number", description: "Minimum seat count" },
              limit: { type: "number", description: "Max results (default 10)" },
            },
            required: [],
          },
        },
      },
      async execute(input, search) {
        if (
          (input.kind !== undefined && input.kind !== "informal") ||
          input.room !== undefined ||
          input.min_minutes !== undefined ||
          input.date !== undefined
        ) {
          throw new Error("Room booking availability is not available. Search study-space descriptions instead.");
        }
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
