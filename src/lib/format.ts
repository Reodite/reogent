// Formatting helpers: session-list grouping, currency, distances.

export type SessionGroup = "Today" | "Yesterday" | "This week" | "This month" | "Older";

export const SESSION_GROUP_ORDER: SessionGroup[] = ["Today", "Yesterday", "This week", "This month", "Older"];

function startOfDay(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** Bucket an ISO timestamp relative to `now`. Future dates land in "Today". */
export function sessionGroup(updatedAt: string, now: Date = new Date()): SessionGroup {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return "Older";
  const dayMs = 86_400_000;
  const today = startOfDay(now);
  const day = startOfDay(updated);
  if (day >= today) return "Today";
  if (day >= today - dayMs) return "Yesterday";
  if (day >= today - 6 * dayMs) return "This week";
  if (updated.getFullYear() === now.getFullYear() && updated.getMonth() === now.getMonth()) return "This month";
  return "Older";
}

export function formatCad(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km.toFixed(km >= 10 ? 0 : 1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  const rounded = Math.max(1, Math.round(minutes));
  return `${rounded} min`;
}

/** Natural-language description of a tool call for the activity badge. */
export function describeToolCall(name: string, input: Record<string, unknown>): string {
  const s = (k: string) => {
    const v = input[k];
    return typeof v === "string" ? v : String(v ?? "");
  };
  const has = (k: string) => input[k] !== undefined && input[k] !== null && input[k] !== "";

  switch (name) {
    case "walking_distance":
      return `Searched for walking distance from ${s("from_building")} to ${s("to_building")}`;
    case "find_building":
      return `Searched for building: ${s("query")}`;
    case "search_courses":
      return `Searched for courses: ${s("query")}`;
    case "get_course":
      return `Searched for course: ${s("course_code")}`;
    case "get_tuition":
      return `Searched for tuition: ${s("program_slug")}`;
    case "find_places":
      return has("near_building")
        ? `Searched for places: ${s("query")} near ${s("near_building")}`
        : `Searched for places: ${s("query")}`;
    case "get_key_dates":
      return has("query") ? `Searched for key dates: ${s("query")}` : "Searched for key dates";
    case "search_events":
      return has("query") ? `Searched for events: ${s("query")}` : "Searched for events";
    case "search_programs":
      return `Searched for programs: ${s("query")}`;
    case "get_admission_requirements":
      return has("query")
        ? `Searched for admission requirements: ${s("query")}`
        : "Searched for admission requirements";
    case "show_widget":
      return has("query") ? `Searched for: ${s("query")}` : "Searched";
    default:
      return `Searched: ${name}`;
  }
}
