// Canonical shared types for the Reodite API contract.
// Both src/lib/ (frontend) and src/server/ (backend) import from here.

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Tool calls made during this assistant turn (persisted for history display). */
  toolCalls?: ToolCall[];
  /** Interstitial thinking/tool-call blocks shown before the answer. */
  interstitial?: InterstitialBlock[];
}

export interface InterstitialBlock {
  type: "thinking" | "tool_call";
  content: string;
  input?: Record<string, unknown>;
  result?: unknown;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
}

export interface ChatResponse {
  message: string;
  tool_calls: ToolCall[];
  warning?: string;
  follow_ups?: string[];
}

export interface SessionSummary {
  session_id: string;
  /** First user message, ≤80 chars. */
  title: string;
  /** ISO 8601. */
  updatedAt: string;
}

/** Failed tool calls carry this as `result`; renderers treat it as "no visualization". */
export interface ToolErrorResult {
  status: "error";
  message: string;
}

export function isToolError(result: unknown): result is ToolErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as { status?: unknown }).status === "error" &&
    typeof (result as { message?: unknown }).message === "string"
  );
}

/** Coordinate tuple in GeoJSON order: [longitude, latitude]. */
export type LngLat = [number, number];

/** Great-circle distance in meters (Haversine formula). */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Haversine overload accepting {lat, lon} objects (converts to LngLat internally). */
export function haversineMetersObj(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return haversineMeters([a.lon, a.lat], [b.lon, b.lat]);
}

// Walking constants
export const WALK_SPEED_M_PER_MIN = 80;
export const ESTIMATE_DETOUR = 1.3;
