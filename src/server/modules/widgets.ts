import type { DatasetModule, SearchClient } from "../core/types";
import { sanitizeMeiliId } from "../ingest";
import { route } from "../routing";
import { resolveBuilding } from "./buildings";
import { findByCode, presentCourse, type CourseDoc } from "./courses";
import { courseAverage, courseGrades } from "./grades";
import { lookupTuition } from "./tuition";

/**
 * show_widget is a presentation-only tool. It takes the explicit entities the
 * agent already resolved via a data tool (course codes, event ids, building
 * names, ...) and returns the full records for those entities so the client
 * renders an answer card. It never re-runs a search and never accepts a
 * natural-language query: the agent names exactly what the card should show.
 *
 * The result shape for each type matches what the client renderers and the
 * canvas mapping already consume ({ courses }, { places }, { parking },
 * { events }, { dates }, ...), so existing stored-history cards keep rendering.
 */

async function getDocs(search: SearchClient, index: string, ids: string[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const id of ids) {
    try {
      out.push((await search.index(index).getDocument(sanitizeMeiliId(id))) as Record<string, unknown>);
    } catch {
      // skip ids that no longer resolve
    }
  }
  return out;
}

async function getCoursesByCodes(search: SearchClient, codes: string[]): Promise<CourseDoc[]> {
  const out: CourseDoc[] = [];
  for (const code of codes) {
    const doc = await findByCode(search, code);
    if (doc) out.push(doc);
  }
  return out;
}

export function createWidgetsModule(): DatasetModule {
  return {
    name: "widgets",
    indices: [],
    tools: [
      {
        spec: {
          name: "show_widget",
          description:
            "Display a rich data widget as the answer card in chat. Data tools only fetch facts; they never render a card. Before calling show_widget you MUST already have the data to show: call the matching data tool, read its results, then call show_widget naming EXACTLY the entities the card should display (course codes, event ids, place ids, building codes, ...). show_widget only renders what you explicitly name — it does not search or guess.",
          inputSchema: {
            json: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "courses",
                    "course",
                    "grades",
                    "building",
                    "route",
                    "tuition",
                    "places",
                    "parking",
                    "event",
                    "study_spaces",
                    "program",
                    "key_dates",
                  ],
                  description:
                    'The kind of card: "courses" (a list of courses), "course" (one course), "grades" (grade distribution for one course), "building" (one or more buildings), "route" (a walking route), "tuition" (a tuition rate), "places" (points of interest by id), "parking" (parking lots by id), "event" (events by id), "study_spaces" (study areas or library rooms), "program" (admission programs by id), "key_dates" (calendar dates by id)',
                },
                course_codes: {
                  type: "array",
                  items: { type: "string" },
                  description: 'courses only: course codes to display, e.g. ["MATH 101", "CPSC 110"]',
                },
                course: {
                  type: "string",
                  description: 'course/grades only: one course code, e.g. "CHEM 121"',
                },
                include_grades: {
                  type: "boolean",
                  description: "grades only: include the grade distribution histogram",
                },
                buildings: {
                  type: "array",
                  items: { type: "string" },
                  description: 'building only: building codes or names, e.g. ["ICCS", "IKB"]',
                },
                from_building: {
                  type: "string",
                  description: "route only: origin building code or name",
                },
                to_building: {
                  type: "string",
                  description: "route only: destination building code or name",
                },
                program_slug: {
                  type: "string",
                  description: "tuition only: slugified program name, e.g. bachelor-of-science",
                },
                student_type: {
                  type: "string",
                  description: "tuition only: domestic or international",
                },
                cohort_year: {
                  type: "number",
                  description: "tuition only: the student's start year",
                },
                place_ids: {
                  type: "array",
                  items: { type: "string" },
                  description: 'places only: POI ids from a find_places result, e.g. ["VPOI10040"]',
                },
                near_building: {
                  type: "string",
                  description:
                    "places only: display-only label of the reference building (the agent must have already done the distance sort in find_places); this is NOT used to query or re-rank",
                },
                parking_ids: {
                  type: "array",
                  items: { type: "string" },
                  description: 'parking only: parking facility ids from a find_places result, e.g. ["2126"]',
                },
                event_ids: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "event only: numeric event ids from a find_events result, e.g. [38481, 38480] (the find_events result includes id)",
                },
                study_space_ids: {
                  type: "array",
                  items: { type: "string" },
                  description: "study_spaces (informal) only: study-space ids from find_study_spaces",
                },
                room_eids: {
                  type: "array",
                  items: { type: "string" },
                  description: "study_spaces (bookable) only: library-room eids from find_study_spaces",
                },
                program_ids: {
                  type: "array",
                  items: { type: "number" },
                  description: "program only: admission program ids from a find_programs result",
                },
                key_date_ids: {
                  type: "array",
                  items: { type: "string" },
                  description: "key_dates only: key-date ids from a get_key_dates result",
                },
              },
              required: ["type"],
            },
          },
        },
        async execute(input, search) {
          const type = String(input.type ?? "");

          switch (type) {
            case "courses": {
              const codes = asStringArray(input.course_codes);
              if (codes.length === 0) throw new Error("show_widget type 'courses' requires course_codes");
              const docs = await getCoursesByCodes(search, codes);
              if (docs.length === 0) throw new Error("None of the given course codes resolved");
              return { type, result: { courses: docs.map((c) => presentCourse(c, 10)) } };
            }

            case "course": {
              const code = String(input.course ?? "");
              if (!code) throw new Error("show_widget type 'course' requires course");
              const doc = await findByCode(search, code);
              if (!doc) throw new Error(`No course found with code "${code}"`);
              return { type, result: presentCourse(doc) };
            }

            case "grades": {
              const code = String(input.course ?? "");
              if (!code) throw new Error("show_widget type 'grades' requires course");
              const doc = await findByCode(search, code);
              if (!doc) throw new Error(`No course found with code "${code}"`);
              const grade = await courseAverage(search, doc.subject, doc.number);
              const result: Record<string, unknown> = {
                ...presentCourse(doc),
                ...(grade !== null ? { grade_avg: grade } : {}),
              };
              const full = await courseGrades(search, doc.subject, doc.number);
              if (full) {
                result.grade_summary = full.summary;
                result.grade_distribution = full.distribution;
              }
              if (!result.grade_summary) throw new Error(`No grade records found for "${code}"`);
              return { type, result };
            }

            case "building": {
              const names = asStringArray(input.buildings);
              if (names.length === 0) throw new Error("show_widget type 'building' requires buildings");
              const docs = [];
              for (const n of names) {
                try {
                  const doc = await resolveBuilding(search, n);
                  if (doc) docs.push(doc);
                } catch {
                  // skip unresolvable
                }
              }
              if (docs.length === 0) throw new Error("None of the given buildings resolved");
              return { type, result: docs[0] };
            }

            case "route": {
              const fromB = String(input.from_building ?? "");
              const toB = String(input.to_building ?? "");
              if (!fromB || !toB) throw new Error("show_widget type 'route' requires from_building and to_building");
              const from = await resolveBuilding(search, fromB);
              const to = await resolveBuilding(search, toB);
              if (from.code === to.code) {
                return { type, result: { from: from.code, to: to.code, meters: 0, minutes: 0 } };
              }
              const { meters, minutes } = await route(from, to);
              return { type, result: { from: from.code, to: to.code, meters, minutes } };
            }

            case "tuition": {
              if (!input.program_slug || !input.student_type || input.cohort_year === undefined) {
                throw new Error("show_widget type 'tuition' requires program_slug, student_type, cohort_year");
              }
              const result = await lookupTuition(
                {
                  program_slug: String(input.program_slug),
                  student_type: String(input.student_type),
                  cohort_year: Number(input.cohort_year),
                },
                search,
              );
              return { type, result };
            }

            case "places": {
              const ids = asStringArray(input.place_ids);
              if (ids.length === 0) throw new Error("show_widget type 'places' requires place_ids");
              const places = await getDocs(search, "poi", ids);
              if (places.length === 0) throw new Error("None of the given place ids resolved");
              return {
                type,
                result: {
                  ...(input.near_building ? { near_building: String(input.near_building) } : {}),
                  places,
                },
              };
            }

            case "parking": {
              const ids = asStringArray(input.parking_ids);
              if (ids.length === 0) throw new Error("show_widget type 'parking' requires parking_ids");
              const parking = await getDocs(search, "parking", ids);
              if (parking.length === 0) throw new Error("None of the given parking ids resolved");
              return {
                type,
                result: {
                  ...(input.near_building ? { near_building: String(input.near_building) } : {}),
                  parking,
                },
              };
            }

            case "event": {
              const ids = asStringArray(input.event_ids);
              if (ids.length === 0) throw new Error("show_widget type 'event' requires event_ids");
              // Accept the id exactly as find_events returns it (e.g.
              // "events_ubc_ca_id_38483", already sanitized) or a bare numeric
              // suffix (38483); both resolve to the same stored document.
              const resolved = ids.map((i) => (/^\d+$/.test(i) ? `events.ubc.ca?id=${Number(i)}` : i));
              const events = await getDocs(search, "events", resolved);
              if (events.length === 0) throw new Error("None of the given event ids resolved");
              return {
                type,
                result: {
                  events: events.map((e) => ({ ...e, text: String((e as { text: string }).text ?? "").slice(0, 400) })),
                },
              };
            }

            case "study_spaces": {
              const spaceIds = asStringArray(input.study_space_ids);
              const roomEids = asStringArray(input.room_eids);
              if (spaceIds.length === 0 && roomEids.length === 0) {
                throw new Error("show_widget type 'study_spaces' requires study_space_ids or room_eids");
              }
              if (roomEids.length > 0) {
                const rooms = await getDocs(search, "lib_rooms", roomEids);
                if (rooms.length === 0) throw new Error("None of the given room eids resolved");
                return { type, result: { kind: "bookable", rooms } };
              }
              const spaces = await getDocs(search, "study_spaces", spaceIds);
              if (spaces.length === 0) throw new Error("None of the given study space ids resolved");
              return { type, result: { kind: "informal", spaces } };
            }

            case "program": {
              const ids = (Array.isArray(input.program_ids) ? input.program_ids : []).map((p) => String(p));
              if (ids.length === 0) throw new Error("show_widget type 'program' requires program_ids");
              const programs = await getDocs(search, "admission_programs", ids);
              if (programs.length === 0) throw new Error("None of the given program ids resolved");
              return {
                type,
                result: {
                  programs: programs.map((p) => ({
                    ...p,
                    summary: String((p as { summary: string }).summary ?? "").slice(0, 300),
                  })),
                },
              };
            }

            case "key_dates": {
              const ids = asStringArray(input.key_date_ids);
              if (ids.length === 0) throw new Error("show_widget type 'key_dates' requires key_date_ids");
              const dates = await getDocs(search, "key_dates", ids);
              if (dates.length === 0) throw new Error("None of the given key-date ids resolved");
              return { type, result: { dates } };
            }

            default:
              throw new Error(`Unknown widget type: ${type}`);
          }
        },
      },
    ],
  };
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (item !== null && item !== undefined) out.push(String(item));
  }
  return out;
}
