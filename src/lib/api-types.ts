// Shared request/response types for the /api/* contract.
// Source of truth: src/shared/types.ts — re-exported here for convenience.

export {
  type ChatMessage,
  type ChatResponse,
  type InterstitialBlock,
  type LngLat,
  type SessionSummary,
  type ToolCall,
  type ToolErrorResult,
  isToolError,
  haversineMeters,
  WALK_SPEED_M_PER_MIN,
  ESTIMATE_DETOUR,
} from "@/src/shared/types";

// Tool result payloads shaped as the API returns them.

/** Course document as it appears in tool results: section times already formatted "HH:MM". */
export interface CourseDoc {
  code: string;
  subject: string;
  number: string;
  title: string;
  description: string;
  credits: number | null;
  prerequisite: string | null;
  corequisite: string | null;
  sections: CourseSection[];
  total_sections?: number;
}

export interface CourseSection {
  section: string;
  term: string | null;
  days: string[];
  start_time: string | null;
  end_time: string | null;
  instructor?: string;
  status?: string;
}

export interface SearchCoursesResult {
  courses: CourseDoc[];
}

export interface TuitionResult {
  program: string;
  program_slug: string;
  student_type: "domestic" | "international";
  cohort_year: number;
  unit?: string;
  amount_cad?: number;
  per_credit_cad?: number;
  instalments?: number;
  applies_to?: string | null;
  rate_type?: string | null;
  other_rates?: {
    applies_to: string | null;
    rate_type: string | null;
    unit: string;
    amount_cad: number;
    instalments?: number;
  }[];
}

export interface WalkingDistanceResult {
  from: string;
  to: string;
  meters: number;
  minutes: number;
  method?: "network" | "estimate";
}

export interface WalkingDistanceInput {
  from_building: string;
  to_building: string;
}

export interface RouteResponse {
  from: string;
  to: string;
  meters: number;
  minutes: number;
  method: "network" | "estimate";
  polyline: import("@/src/shared/types").LngLat[];
}

// GET /api/building/{code} — per-building popup details (rooms, POIs, availability).

export interface RoomCard {
  name: string; // e.g. "AERL 120"
  capacity: number | null;
  floor: number | null;
  layout: string | null;
  furniture: string | null;
  photo: string | null;
  link: string | null;
}

export interface PoiCard {
  name: string;
  service_type: string | null;
  url: string | null;
  photo: string | null;
  hours: string | null; // free text — display verbatim
  contact: string | null;
}

export interface AvailabilityRoomCard {
  title: string;
  capacity: number | null;
  url: string | null;
  thumbnail: string | null;
  freeNow: boolean;
  freeUntil: string | null; // "HH:MM"
  nextFree: string | null; // "HH:MM"
}

export interface BuildingDetails {
  code: string;
  name: string;
  rooms: RoomCard[];
  pois: PoiCard[];
  /** Bookable library rooms from the latest snapshot; null when the building has none. */
  availability: { as_of: string | null; rooms: AvailabilityRoomCard[] } | null;
}

export type GeoName = "buildings" | "walking-routes";

/** Error shape of every non-2xx response: `{ "error": "..." }`. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
