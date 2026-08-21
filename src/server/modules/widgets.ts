import type { DatasetModule } from "../core/types";

function parseQuery(type: string, query: string): Record<string, unknown> {
  switch (type) {
    case "course":
      return { query, limit: 6 };
    case "course_detail":
      return { course_code: query };
    case "tuition": {
      const parts = query.split(/\s+/);
      const programSlug = parts[0]?.toLowerCase() ?? "";
      const studentType = parts.includes("international") ? "international" : "domestic";
      const cohortYear = parts.find((p) => /^\d{4}$/.test(p)) ?? "2025";
      return { program_slug: programSlug, student_type: studentType, cohort_year: Number(cohortYear) };
    }
    case "route": {
      const m = query.match(/(.+?)\s+(?:to|→|->)\s+(.+)/);
      return m
        ? { from_building: m[1].trim(), to_building: m[2].trim() }
        : { from_building: query, to_building: query };
    }
    case "building":
      return { query };
    case "places":
      return { query, limit: 10 };
    case "event":
      return { query, limit: 5 };
    default:
      return {};
  }
}

export function createWidgetsModule(modules: DatasetModule[]): DatasetModule {
  return {
    name: "widgets",
    indices: [],
    tools: [
      {
        spec: {
          name: "show_widget",
          description:
            "Display a rich data widget as the answer. The widget replaces a text answer — call this instead of writing prose when a visual card is appropriate. The type is the kind of data to show, and the query is a natural language identifier for what to display.",
          inputSchema: {
            json: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["course", "course_detail", "tuition", "route", "building", "places", "event"],
                  description:
                    'What to show: "course" (search results),"course_detail" (one course), "tuition" (rates), "route" (walking distance), "building" (location), "places" (POIs), "event" (campus event)',
                },
                query: {
                  type: "string",
                  description:
                    'What to display: for course/list a keyword, for course_detail a code like "CPSC 110", for tuition a program name + type, for route "from X to Y", for building a name/code, for places keywords + "near X", for event keywords + a date range',
                },
              },
              required: ["type", "query"],
            },
          },
        },
        async execute(input, search) {
          const type = String(input.type ?? "");
          const query = String(input.query ?? "");
          const toolName = {
            course: "search_courses",
            course_detail: "get_course",
            tuition: "get_tuition",
            route: "walking_distance",
            building: "find_building",
            places: "find_places",
            event: "search_events",
          }[type];
          if (!toolName) throw new Error(`Unknown widget type: ${type}`);
          const toolInput = parseQuery(type, query);
          for (const m of modules) {
            const tool = m.tools.find((t) => t.spec.name === toolName);
            if (tool) {
              const result = await tool.execute(toolInput, search);
              return { type, result };
            }
          }
          throw new Error(`No tool found for ${toolName}`);
        },
      },
    ],
  };
}
