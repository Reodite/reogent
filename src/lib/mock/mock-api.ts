// In-memory implementation of ChatApi for NEXT_PUBLIC_API_MOCK=1.
// Mirrors api-spec.md behavior — including 400/401 errors, the iteration-limit
// `warning`, and tool_calls fixtures — so every UI state is reachable offline.
//
// Demo triggers in the last user message:
//   walk/distance/route + two building names  → walking_distance tool call
//   course keywords (or a code like CPSC 310) → search_courses (+ get_course for a code)
//   tuition/cost keywords                     → get_tuition
//   "every course/building …"                 → 200 with the iteration-limit warning
//   empty messages array                      → ApiError 400 (as the real API would)
//   no bearer token                           → ApiError 401

import type { ChatApi } from "@/src/lib/api";
import {
  ApiError,
  ESTIMATE_DETOUR,
  WALK_SPEED_M_PER_MIN,
  type ChatMessage,
  type ChatResponse,
  type CourseDoc,
  type SessionSummary,
  type ToolCall,
  type WalkingDistanceResult,
} from "@/src/lib/api-types";
import { featureCentroid, findBuilding, haversineMeters } from "@/src/lib/geo";
import { MOCK_COURSES, MOCK_TUITION } from "@/src/lib/mock/course-fixtures";
import { mockBuildingsGeoJson, mockWalkingRoutesGeoJson } from "@/src/lib/mock/geo-fixtures";
import type { FeatureCollection } from "geojson";

interface StoredSession {
  summary: SessionSummary;
  messages: ChatMessage[];
}

export interface MockApiOptions {
  getToken: () => Promise<string | null>;
  /** Base latency per request; chat waits ~2× this. 0 in tests. */
  latencyMs?: number;
  /** Skip seeding demo sessions (tests start empty). */
  seed?: boolean;
}

const STORAGE_KEY = "campus.mock.sessions.v1";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 80 ? `${clean.slice(0, 79)}…` : clean;
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

function seedSessions(): Map<string, StoredSession> {
  const seeds: Array<{ id: string; hoursAgo: number; messages: ChatMessage[] }> = [
    {
      id: "5d47c1b2-9f7e-4c93-8f6a-2f3f4f1a9d01",
      hoursAgo: 2,
      messages: [
        { role: "user", content: "How long is the walk from IKB to ICCS?" },
        {
          role: "assistant",
          content:
            "It's about a 10 minute walk (roughly 790 m) from Irving K. Barber Learning Centre (IKB) to ICCS, heading south along East Mall. Distance comes from the walking_distance tool over campus building data.",
        },
      ],
    },
    {
      id: "b8a91c3e-6d24-47f5-9b7c-8e1d2c3f4a02",
      hoursAgo: 26,
      messages: [
        { role: "user", content: "What are the prerequisites for CPSC 310?" },
        {
          role: "assistant",
          content:
            "CPSC 310 (Introduction to Software Engineering) requires one of CPSC 210 or CPEN 221, and one of CPSC 213 or CPEN 211 — per the course record from get_course.",
        },
      ],
    },
    {
      id: "0f2e4d6c-8b1a-4392-b5d7-6c9e0a1b2c03",
      hoursAgo: 8 * 24,
      messages: [
        { role: "user", content: "Tuition per credit for international Science students?" },
        {
          role: "assistant",
          content:
            "For the Bachelor of Science (2026 cohort), international students pay $1,494.65 CAD per credit, from the get_tuition rate table.",
        },
      ],
    },
  ];
  const map = new Map<string, StoredSession>();
  for (const seed of seeds) {
    map.set(seed.id, {
      summary: {
        session_id: seed.id,
        title: truncateTitle(seed.messages[0].content),
        updatedAt: hoursAgo(seed.hoursAgo),
      },
      messages: seed.messages,
    });
  }
  return map;
}

function loadPersisted(): Map<string, StoredSession> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession[];
    return new Map(parsed.map((s) => [s.summary.session_id, s]));
  } catch {
    return null;
  }
}

function persist(sessions: Map<string, StoredSession>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...sessions.values()]));
  } catch {
    // Storage full or unavailable — mock keeps working in memory.
  }
}

// ---- Chat "agent" ----

const COURSE_CODE_RE = /\b([a-z]{2,4})\s*[_ ]?\s*(\d{3})\b/i;

function detectBuildingMentions(text: string): string[] {
  const codes = [
    "ICCS",
    "IKB",
    "NEST",
    "BUCH",
    "ESB",
    "MATH",
    "ANGU",
    "LSK",
    "WOOD",
    "HEBB",
    "FSC",
    "CHBE",
    "ALRD",
    "KAIS",
  ];
  const names: Record<string, string> = {
    BARBER: "IKB",
    BUCHANAN: "BUCH",
    "EARTH SCIENCES": "ESB",
    ANGUS: "ANGU",
    SAUDER: "ANGU",
    WOODWARD: "WOOD",
    "FOREST SCIENCES": "FSC",
    ALLARD: "ALRD",
    KAISER: "KAIS",
    KLINCK: "LSK",
  };
  const upper = text.toUpperCase();
  // Order matches by their position in the sentence: "from IKB to ICCS" must
  // resolve from=IKB even though ICCS sorts earlier in the known-code list.
  const found = new Map<string, number>();
  for (const code of codes) {
    const match = new RegExp(`\\b${code}\\b`).exec(upper);
    if (match) found.set(code, match.index);
  }
  for (const [name, code] of Object.entries(names)) {
    const index = upper.indexOf(name);
    if (index >= 0 && !found.has(code)) found.set(code, index);
  }
  return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([code]) => code);
}

function detectBuildings(text: string): [string, string] | null {
  const ordered = detectBuildingMentions(text);
  if (ordered.length >= 2) return [ordered[0], ordered[1]];
  return null;
}

function walkingDistanceCall(from: string, to: string): ToolCall {
  const fromFeature = findBuilding(mockBuildingsGeoJson, from);
  const toFeature = findBuilding(mockBuildingsGeoJson, to);
  const a = fromFeature ? featureCentroid(fromFeature) : null;
  const b = toFeature ? featureCentroid(toFeature) : null;
  if (!a || !b) {
    return {
      name: "walking_distance",
      input: { from_building: from, to_building: to },
      result: { status: "error", message: `Unknown building: ${a ? to : from}` },
    };
  }
  const meters = Math.round((haversineMeters(a, b) * ESTIMATE_DETOUR) / 10) * 10;
  const minutes = Math.max(1, Math.round(meters / WALK_SPEED_M_PER_MIN));
  return {
    name: "walking_distance",
    input: { from_building: from, to_building: to },
    result: { from, to, meters, minutes },
  };
}

function courseMatches(query: string): CourseDoc[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  const scored = MOCK_COURSES.map((course) => {
    const haystack = `${course.code} ${course.title} ${course.description} ${course.subject}`.toLowerCase();
    const score = terms.reduce((n, t) => (haystack.includes(t) ? n + 1 : n), 0);
    return { course, score };
  });
  const hits = scored.filter((s) => s.score > 0).sort((x, y) => y.score - x.score);
  return (hits.length > 0 ? hits : scored).slice(0, 5).map((s) => s.course);
}

function respondToChat(text: string): ChatResponse {
  const lower = text.toLowerCase();

  // Iteration-limit warning demo: sweeping "every/all …" questions.
  if (/\b(every|all)\b.*\b(course|building|program)s?\b/.test(lower)) {
    const courses = MOCK_COURSES.slice(0, 3);
    return {
      message:
        "That's a broad one — I started walking the catalogue but hit my tool-call budget before finishing. Here's what I confirmed so far: " +
        courses.map((c) => `${c.code.replace("_V", "")} (${c.title})`).join(", ") +
        ". Try narrowing by subject or term and I can go deeper.",
      tool_calls: [
        { name: "search_courses", input: { query: "all courses", limit: 20 }, result: { courses } },
        {
          name: "search_courses",
          input: { query: "all courses", subject: "CPSC" },
          result: { courses: courses.slice(0, 2) },
        },
      ],
      warning: "Iteration limit reached: the agent stopped after 8 model calls; the answer may be incomplete.",
    };
  }

  // "Where is X" (exactly one building mentioned) → find_building: the map
  // highlights the footprint and flies to it.
  if (
    /\b(where is|where's|find|locate|show me)\b/.test(lower) &&
    !/\b(courses?|class|tuition|credits?)\b/.test(lower)
  ) {
    const mentions = detectBuildingMentions(text);
    if (mentions.length === 1) {
      const code = mentions[0];
      const feature = findBuilding(mockBuildingsGeoJson, code);
      const center = feature ? featureCentroid(feature) : null;
      if (feature && center) {
        const name = String(feature.properties?.NAME ?? code);
        return {
          message: `${name} (${code}) is highlighted on the map — location resolved with the find_building tool.`,
          tool_calls: [
            {
              name: "find_building",
              input: { query: code },
              result: { code, name, lat: center[1], lon: center[0] },
            },
          ],
        };
      }
    }
  }

  const buildings = /\b(walk|far|distance|route|get from|minutes? from)\b/.test(lower) ? detectBuildings(text) : null;
  if (buildings) {
    const call = walkingDistanceCall(buildings[0], buildings[1]);
    const succeeded = typeof call.result === "object" && call.result !== null && "meters" in call.result;
    if (succeeded) {
      const r = call.result as WalkingDistanceResult;
      return {
        message: `It's about a ${r.minutes} minute walk (roughly ${r.meters} m) from ${buildings[0]} to ${buildings[1]}. I've highlighted both buildings and the route on the map — distance comes from the walking_distance tool over campus building data.`,
        tool_calls: [call],
      };
    }
    return {
      message: `I couldn't find one of those buildings in the campus dataset, so I can't compute that walk. Try a building code like ICCS, IKB, or NEST.`,
      tool_calls: [call],
    };
  }

  // Tuition outranks course search: "per credit" questions mention credits too.
  if (/\b(tuition|fee|fees|per[- ]credit|how much.*(pay|cost))\b/.test(lower) || /\btuition\b/.test(lower)) {
    const international = /international/.test(lower);
    const arts = /\barts?\b/.test(lower);
    const row =
      MOCK_TUITION.find(
        (t) =>
          t.student_type === (international ? "international" : "domestic") &&
          t.program_slug === (arts ? "bachelor-of-arts" : "bachelor-of-science"),
      ) ?? MOCK_TUITION[0];
    return {
      message: `${row.program} students (${row.student_type}, ${row.cohort_year} cohort) pay $${row.per_credit_cad!.toFixed(2)} CAD per credit — a standard 4-credit course is about $${(row.per_credit_cad! * 4).toFixed(2)}. Rate from the get_tuition table.`,
      tool_calls: [
        {
          name: "get_tuition",
          input: { program_slug: row.program_slug, student_type: row.student_type, cohort_year: row.cohort_year },
          result: row,
        },
      ],
    };
  }

  const codeMatch = text.match(COURSE_CODE_RE);
  const asksCourses = /\b(course|prereq|prerequisite|class|credit|schedule|section)\w*\b/.test(lower);
  if (codeMatch && asksCourses) {
    const code = `${codeMatch[1].toUpperCase()}_V ${codeMatch[2]}`;
    const course = MOCK_COURSES.find((c) => c.code === code);
    const searchCall: ToolCall = {
      name: "search_courses",
      input: { query: `${codeMatch[1].toUpperCase()} ${codeMatch[2]}`, limit: 5 },
      result: { courses: course ? [course] : courseMatches(text) },
    };
    if (!course) {
      return {
        message: `I searched the catalogue but couldn't find ${codeMatch[1].toUpperCase()} ${codeMatch[2]} in the indexed data. Closest matches are shown below — data via search_courses.`,
        tool_calls: [searchCall],
      };
    }
    const getCall: ToolCall = { name: "get_course", input: { course_code: course.code }, result: course };
    const prereq = course.prerequisite ? `Prerequisites: ${course.prerequisite}` : "It has no prerequisites.";
    return {
      message: `${course.code.replace("_V", "")} — ${course.title} (${course.credits} credits). ${prereq} Course record via search_courses and get_course.`,
      tool_calls: [searchCall, getCall],
    };
  }

  if (asksCourses || /\bfind\b.*\b(cpsc|math|anth)\b/.test(lower)) {
    const noPrereqs = /no.{0,8}prereq/.test(lower);
    const credits = lower.match(/(\d)\s*[- ]?credit/)?.[1];
    const courses = courseMatches(text).filter(
      (c) => (!noPrereqs || c.prerequisite === null) && (!credits || c.credits === Number(credits)),
    );
    return {
      message:
        courses.length > 0
          ? `I found ${courses.length} matching course${courses.length === 1 ? "" : "s"} in the catalogue — details below, via the search_courses tool.`
          : "No courses in the indexed catalogue matched those filters. Try loosening the credit count or subject — results come from the search_courses tool.",
      tool_calls: [
        {
          name: "search_courses",
          input: {
            query: text.slice(0, 60),
            ...(noPrereqs ? { has_no_prereqs: true } : {}),
            ...(credits ? { credits: Number(credits) } : {}),
          },
          result: { courses },
        },
      ],
    };
  }

  return {
    message:
      "I can help with UBC courses (search, prerequisites, sections), tuition per credit, and walking times between campus buildings. Try “How long is the walk from IKB to ICCS?” or “Find 3-credit CPSC courses with no prerequisites.”",
    tool_calls: [],
  };
}

export function createMockApi({ getToken, latencyMs = 1400, seed = true }: MockApiOptions): ChatApi {
  const sessions: Map<string, StoredSession> = loadPersisted() ?? (seed ? seedSessions() : new Map());

  async function requireToken(): Promise<void> {
    const token = await getToken();
    if (!token) throw new ApiError(401, "Missing or invalid bearer token");
  }

  return {
    async chat(sessionId, messages, callbacks) {
      await requireToken();
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new ApiError(400, "messages must be a non-empty array");
      }
      const last = messages[messages.length - 1];
      if (last?.role !== "user" || typeof last.content !== "string" || last.content.trim() === "") {
        throw new ApiError(400, "last message must be a non-empty user message");
      }
      const response = respondToChat(last.content);

      // Simulate streaming: emit thinking, tool calls, then text
      if (callbacks) {
        if (callbacks.onThinking) {
          callbacks.onThinking("Let me look that up for you...");
          await sleep(50);
        }
        for (const tc of response.tool_calls) {
          if (callbacks.onToolStart) callbacks.onToolStart(tc.name, tc.input);
          await sleep(100);
          if (callbacks.onToolEnd) callbacks.onToolEnd(tc.name, tc.result);
          await sleep(50);
        }
        if (response.tool_calls.length > 1 && callbacks.onTurnStart && callbacks.onThinking) {
          callbacks.onTurnStart();
          callbacks.onThinking("Now let me put that together...");
          await sleep(50);
        }
        if (callbacks.onDelta) {
          const words = response.message.split(" ");
          for (const word of words) {
            callbacks.onDelta(word + " ");
            await sleep(20);
          }
        }
      } else {
        await sleep(latencyMs * (response.tool_calls.length > 1 ? 2 : 1.4));
      }

      const existing = sessions.get(sessionId);
      const stored: StoredSession = existing ?? {
        summary: { session_id: sessionId, title: truncateTitle(last.content), updatedAt: new Date().toISOString() },
        messages: [],
      };
      stored.messages = [
        ...stored.messages,
        { role: "user", content: last.content },
        {
          role: "assistant",
          content: response.message,
          ...(response.tool_calls.length > 0 ? { toolCalls: response.tool_calls } : {}),
        },
      ];
      stored.summary = { ...stored.summary, updatedAt: new Date().toISOString() };
      sessions.set(sessionId, stored);
      persist(sessions);
      return response;
    },

    async listSessions() {
      await requireToken();
      await sleep(latencyMs / 4);
      return [...sessions.values()]
        .map((s) => s.summary)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    },

    async getSession(id) {
      await requireToken();
      await sleep(latencyMs / 4);
      const stored = sessions.get(id);
      if (!stored) throw new ApiError(404, "Session not found");
      return [...stored.messages];
    },

    async deleteSession(id) {
      await requireToken();
      sessions.delete(id);
    },

    async renameSession(id, title) {
      await requireToken();
      const stored = sessions.get(id);
      if (!stored) throw new ApiError(404, "Session not found");
      stored.title = title;
    },

    async getProfile() {
      await requireToken();
      return { preferences: {} };
    },

    async putProfile() {
      await requireToken();
    },

    async getGeo(name) {
      await requireToken();
      await sleep(latencyMs / 4);
      if (name === "buildings") return structuredClone(mockBuildingsGeoJson) as FeatureCollection;
      if (name === "walking-routes") return structuredClone(mockWalkingRoutesGeoJson) as FeatureCollection;
      throw new ApiError(404, `Unknown geo dataset: ${name}`);
    },

    async getBuildingDetails(code) {
      await requireToken();
      await sleep(latencyMs / 4);
      const feature = findBuilding(mockBuildingsGeoJson, code);
      if (!feature) throw new ApiError(404, `Unknown building: "${code}"`);
      const bldg = String(feature.properties?.BLDG_CODE ?? code);
      const name = String(feature.properties?.NAME ?? bldg);
      // Static plausible fixtures; photos omitted so the placeholder slot shows.
      return {
        code: bldg,
        name,
        rooms: [
          {
            name: `${bldg} 101`,
            capacity: 120,
            floor: 1,
            layout: "Rows",
            furniture: "Fixed Tablets",
            photo: null,
            link: null,
          },
          {
            name: `${bldg} 202`,
            capacity: 40,
            floor: 2,
            layout: "Moveable Tables",
            furniture: "Moveable Chairs",
            photo: null,
            link: null,
          },
          {
            name: `${bldg} 305`,
            capacity: 8,
            floor: 3,
            layout: "Study Room",
            furniture: "Table & Chairs",
            photo: null,
            link: null,
          },
        ],
        pois: [
          {
            name: "Campus Coffee",
            service_type: "cafe",
            url: "https://food.ubc.ca/",
            photo: null,
            hours: "M-F: 8 am - 4 pm",
            contact: null,
          },
          {
            name: `${name} Services Desk`,
            service_type: "campus_services",
            url: null,
            photo: null,
            hours: "M-F: 9 am - 5 pm",
            contact: "Phone: (604) 822-0000",
          },
        ],
        availability: {
          as_of: new Date().toISOString(),
          rooms: [
            {
              title: `${bldg} Study Room A`,
              capacity: 6,
              url: "https://libcal.library.ubc.ca/",
              thumbnail: null,
              freeNow: true,
              freeUntil: "17:00",
              nextFree: null,
            },
            {
              title: `${bldg} Study Room B`,
              capacity: 10,
              url: "https://libcal.library.ubc.ca/",
              thumbnail: null,
              freeNow: false,
              freeUntil: null,
              nextFree: "15:30",
            },
          ],
        },
      };
    },

    async getRoute(from, to) {
      await requireToken();
      await sleep(latencyMs / 4);
      const fromFeature = findBuilding(mockBuildingsGeoJson, from);
      const toFeature = findBuilding(mockBuildingsGeoJson, to);
      const a = fromFeature ? featureCentroid(fromFeature) : null;
      const b = toFeature ? featureCentroid(toFeature) : null;
      if (!a || !b) throw new ApiError(404, `Unknown building: ${a ? to : from}`);
      const meters = Math.round(haversineMeters(a, b) * ESTIMATE_DETOUR);
      return {
        from: String(fromFeature?.properties?.BLDG_CODE ?? from),
        to: String(toFeature?.properties?.BLDG_CODE ?? to),
        meters,
        minutes: Math.max(1, Math.round(meters / WALK_SPEED_M_PER_MIN)),
        method: "estimate",
        polyline: [a, b],
      };
    },
  };
}
