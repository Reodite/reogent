// Shared request/response types for the /api/* contract.
// Source of truth: src/shared/types.ts — re-exported here for convenience.

export {
  type ChatMessage,
  type ChatResponse,
  type SessionSummary,
  type ToolCall,
  isToolError,
} from "@/src/shared/types";
export type { Citation } from "@/src/shared/citations/citation";

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
  /** Distinct section term names, e.g. "2026-27 Winter Term 1". */
  terms: string[];
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

export interface RouteResponse {
  from: string;
  to: string;
  meters: number;
  minutes: number;
  method: "network" | "estimate";
  polyline: import("@/src/shared/types").LngLat[];
}

export interface BuildingSummary {
  code: string;
  name: string;
  shortName: string | null;
  aliases: string[];
  address: string | null;
  postalCode: string | null;
  usage: string | null;
  state: string | null;
  floors: number | null;
  heightMeters: number | null;
  centroid: import("@/src/shared/types").LngLat;
}

export interface EntranceFeatureProperties {
  id: string;
  buildingCode: string;
  entranceType: string | null;
  doorCount: number | null;
}

export type EntranceFeatureCollection = import("geojson").FeatureCollection<
  import("geojson").Point,
  EntranceFeatureProperties
>;

export interface EntranceMarker {
  id: string;
  buildingCode: string;
  entranceType: string | null;
  entrance: import("@/src/shared/types").LngLat;
  groundArrow: [number, number, number][];
  doorOutline: [number, number, number][];
  wallTangent: [number, number];
  wallDistanceMeters: number;
}

export type BuildingDataAssociation = "direct" | "official-address" | "location-derived";
export type BuildingDataFreshness = "current" | "historical" | "unknown";
export type BuildingSourceState = "ready" | "unavailable";

export interface BuildingDataProvenance {
  sourceName: string;
  refreshedAt: string | null;
  association: BuildingDataAssociation;
}

export interface BuildingSourceStatus {
  state: BuildingSourceState;
  provenance: BuildingDataProvenance;
}

export interface OfficialBuildingPhoto {
  url: string;
  alt: string;
  sourceUrl: string;
  sourceName: string;
  classification: "ubc-hosted" | "official-service" | "reodite-owned";
}

// GET /api/building/{code} — per-building popup details (rooms, POIs, availability).

export interface RoomCard {
  name: string;
  roomNumber: string | null;
  spaceType: string | null;
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
  hours: string | null;
  contact: string | null;
  association: "official-address" | "location-derived";
}

export interface AvailabilityRoomCard {
  title: string;
  capacity: number | null;
  url: string | null;
  thumbnail: string | null;
  freeNow: boolean;
  freeUntil: string | null;
  nextFree: string | null;
}

export interface BuildingAddress {
  fullAddress: string;
  siteName: string | null;
  primary: boolean;
  official: boolean;
  mailing: boolean;
  pointType: string | null;
}

export interface BuildingEntranceSummary {
  id: string;
  entranceType: string | null;
  doorCount: number | null;
  position: import("@/src/shared/types").LngLat;
}

export interface BuildingProfile extends BuildingSummary {
  secondaryUsage: string | null;
  neighbourhood: string | null;
  managingOrganization: string | null;
  maintenanceOrganization: string | null;
  constructionStatus: string | null;
  constructionType: string | null;
  occupancyDate: string | null;
  grossAreaSquareMeters: number | null;
  form: string | null;
  condition: string | null;
  greenStatus: string | null;
}

export interface BuildingDetails {
  code: string;
  name: string;
  building: BuildingProfile;
  addresses: BuildingAddress[];
  rooms: RoomCard[];
  pois: PoiCard[];
  entrances: BuildingEntranceSummary[];
  photos: OfficialBuildingPhoto[];
  availability: {
    as_of: string | null;
    freshness: BuildingDataFreshness;
    rooms: AvailabilityRoomCard[];
  } | null;
  sourceStatus: {
    building: BuildingSourceStatus;
    addresses: BuildingSourceStatus;
    rooms: BuildingSourceStatus;
    availability: BuildingSourceStatus;
    pois: BuildingSourceStatus;
    entrances: BuildingSourceStatus;
  };
}

export type GeoName = "buildings" | "entrances" | "walking-routes";

// GET /api/pulse — active-round feed. Vote fields appear only after the caller votes.

export interface PulseQuestion {
  id: number;
  text: string;
  my_agree?: boolean;
  agree_count?: number;
  disagree_count?: number;
}

export interface PulseFeed {
  round: { id: number; title: string | null; published_at: string } | null;
  questions: PulseQuestion[];
}

/** POST /api/pulse/vote — `agree` is the stored vote (first write wins). */
export interface PulseVoteResult {
  question_id: number;
  agree: boolean;
  agree_count: number;
  disagree_count: number;
}

/** GET /api/pulse/history — locked rounds newest first with final tallies; `my_agree` is null when the caller didn't vote. */
export interface PulseHistory {
  rounds: {
    id: number;
    title: string | null;
    published_at: string;
    questions: { id: number; text: string; my_agree: boolean | null; agree_count: number; disagree_count: number }[];
  }[];
}

/** Error shape of every non-2xx response: `{ "error": "..." }`. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
