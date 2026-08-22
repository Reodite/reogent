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
      return `Searched for walking route from ${s("from_building")} to ${s("to_building")}`;
    case "find_building":
      return `Searched for ${s("query")}`;
    case "find_courses":
      return `Searched courses related to ${s("query")}`;
    case "get_course":
      return `Searched for ${s("course_code")}`;
    case "get_costs": {
      const kind = s("kind");
      if (kind === "tuition") {
        const slug = s("program_slug");
        return slug ? `Searched for ${slug} tuition` : "Searched for tuition";
      }
      if (kind === "estimate") {
        const prog = s("program");
        return prog ? `Searched for ${prog} cost estimate` : "Searched for cost estimate";
      }
      if (kind === "fees") {
        const q = s("query");
        return q ? `Searched for ${q} costs` : "Searched for student fees";
      }
      if (kind === "living") return "Searched for living costs";
      return "Searched for costs";
    }
    case "find_places":
      if (has("near_building")) {
        const q = s("query");
        const near = s("near_building");
        return q ? `Searched for ${q} near ${near}` : `Searched for places near ${near}`;
      }
      return `Searched for ${s("query")}`;
    case "get_key_dates":
      return has("query") ? `Searched for ${s("query")}` : "Searched for key dates";
    case "find_events":
      return has("query") ? `Searched for ${s("query")}` : "Searched for events";
    case "find_programs":
      return `Searched for ${s("query")}`;
    case "find_study_spaces": {
      const kind = s("kind");
      if (kind === "bookable") {
        const q = s("query");
        return q ? `Searched for free rooms in ${q}` : "Searched for free rooms";
      }
      const q = s("query");
      return q ? `Searched for study spaces near ${q}` : "Searched for study spaces";
    }
    case "get_admission_requirements":
      return `Searched for ${s("program")} admission requirements`;
    case "search_ubc_pages":
      return `Searched UBC pages for ${s("query")}`;
    case "show_widget": {
      const type = s("type");
      if (type === "courses") {
        const n = Array.isArray(input.course_codes) ? input.course_codes.length : 0;
        return n > 0 ? `Showing ${n} courses` : "Showing course list";
      }
      if (type === "course") return `Showing ${s("course")}`;
      if (type === "grade_distribution") return `Showing grades for ${s("course")}`;
      if (type === "grades") return `Showing grades for ${s("course")}`;
      if (type === "building") {
        const n = Array.isArray(input.buildings) ? input.buildings.length : 0;
        return n > 0 ? `Showing ${n} building${n > 1 ? "s" : ""}` : "Showing building";
      }
      if (type === "route") return `Showing route from ${s("from_building")} to ${s("to_building")}`;
      if (type === "tuition") return `Showing tuition for ${s("program_slug")}`;
      if (type === "places") {
        const n = Array.isArray(input.place_ids) ? input.place_ids.length : 0;
        return n > 0 ? `Showing ${n} places` : "Showing places";
      }
      if (type === "parking") {
        const n = Array.isArray(input.parking_ids) ? input.parking_ids.length : 0;
        return n > 0 ? `Showing ${n} parking facilities` : "Showing parking";
      }
      if (type === "event") {
        const n = Array.isArray(input.event_ids) ? input.event_ids.length : 0;
        return n > 0 ? `Showing ${n} events` : "Showing event";
      }
      if (type === "study_spaces") {
        const n = Array.isArray(input.study_space_ids) ? input.study_space_ids.length : 0;
        return n > 0 ? `Showing ${n} study spaces` : "Showing study spaces";
      }
      if (type === "program") {
        const n = Array.isArray(input.program_ids) ? input.program_ids.length : 0;
        return n > 0 ? `Showing ${n} programs` : "Showing programs";
      }
      if (type === "key_dates") {
        const n = Array.isArray(input.key_date_ids) ? input.key_date_ids.length : 0;
        return n > 0 ? `Showing ${n} key dates` : "Showing key dates";
      }
      return "Showing widget";
    }
    default: {
      const readable = name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return `Searched: ${readable}`;
    }
  }
}
