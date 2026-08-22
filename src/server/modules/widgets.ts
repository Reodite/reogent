import type { DatasetModule } from "../core/types";

function parseQuery(type: string, query: string): Record<string, unknown> {
  switch (type) {
    case "courses":
    case "course":
      return { query, limit: 6 };
    case "course_detail":
      return { course_code: query };
    case "tuition": {
      const parts = query.split(/\s+/);
      const programSlug = parts[0]?.toLowerCase() ?? "";
      const studentType = parts.includes("international") ? "international" : "domestic";
      const cohortYear = parts.find((p) => /^\d{4}$/.test(p)) ?? "2025";
      return {
        kind: "tuition",
        program_slug: programSlug,
        student_type: studentType,
        cohort_year: Number(cohortYear),
      };
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
      return { kind: "informal", query, limit: 10 };
    case "grades":
      return { course_code: query, include_grades: true };
    case "parking":
      return { category: "parking", query, limit: 6 };
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
                    "courses",
                    "course",
                    "tuition",
                    "route",
                    "building",
                    "places",
                    "event",
                    "study_spaces",
                    "grades",
                    "parking",
                    "program",
                    "key_dates",
                  ],
                  description:
                    'What to show: "courses" (course search results), "course" (one course), "tuition" (rates), "route" (walking distance), "building" (location), "places" (POIs), "event" (campus event), "study_spaces" (study areas and free library rooms), "grades" (grade distribution for a course), "parking" (parking lots), "program" (admission programs), "key_dates" (academic calendar dates)',
                },
                query: {
                  type: "string",
                  description:
                    'What to display: for courses a keyword, for course a code like "CPSC 110", for tuition a program name + type, for route "from X to Y", for building a name/code, for places keywords + "near X", for event keywords + a date range, for study_spaces keywords or a building, for grades a course code, for parking keywords or "near X", for program a program keyword, for key_dates keywords like "withdrawal deadline"',
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
            courses: "find_courses",
            course: "get_course",
            tuition: "get_costs",
            route: "walking_distance",
            building: "find_building",
            places: "find_places",
            event: "find_events",
            study_spaces: "find_study_spaces",
            grades: "get_course",
            parking: "find_places",
            program: "find_programs",
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
