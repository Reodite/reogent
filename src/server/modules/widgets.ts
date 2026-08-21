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
    case "study_spaces":
      return { query, limit: 10 };
    case "free_rooms":
      return { min_minutes: 60 };
    case "grades":
      return { course_code: query };
    case "parking":
      return { query, limit: 6 };
    case "program":
      return { query, limit: 6 };
    case "key_dates":
      return { query, limit: 12 };
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
            "Display a rich data widget as the answer card in chat. Data tools only fetch facts; they never render a card. To actually present a result to the user, you must call show_widget. The type is the kind of data to show, and the query is a natural language identifier for what to display.",
          inputSchema: {
            json: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "course",
                    "course_detail",
                    "tuition",
                    "route",
                    "building",
                    "places",
                    "event",
                    "study_spaces",
                    "free_rooms",
                    "grades",
                    "parking",
                    "program",
                    "key_dates",
                  ],
                  description:
                    'What to show: "course" (search results), "course_detail" (one course), "tuition" (rates), "route" (walking distance), "building" (location), "places" (POIs), "event" (campus event), "study_spaces" (classrooms/informal study areas), "free_rooms" (bookable library rooms free now), "grades" (grade distribution for a course), "parking" (parking lots), "program" (admission programs), "key_dates" (academic calendar dates)',
                },
                query: {
                  type: "string",
                  description:
                    'What to display: for course/list a keyword, for course_detail a code like "CPSC 110", for tuition a program name + type, for route "from X to Y", for building a name/code, for places keywords + "near X", for event keywords + a date range, for study_spaces keywords or a building, for free_rooms leave blank or a library name, for grades a course code, for parking keywords or "near X", for program a program keyword, for key_dates keywords like "withdrawal deadline"',
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
            study_spaces: "search_study_spaces",
            free_rooms: "find_free_rooms",
            grades: "get_grades",
            parking: "find_parking",
            program: "search_programs",
            key_dates: "get_key_dates",
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
