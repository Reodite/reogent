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

export function formatMinutes(minutes: number | undefined): string {
  if (!Number.isFinite(minutes)) return "—";
  const rounded = Math.max(1, Math.round(minutes as number));
  return `${rounded} min`;
}

/** Natural-language description of a tool call for the activity badge.
 *  Labels are built from whichever parameters are actually present so partial
 *  inputs never render a dangling tail like "Searched for ". */
export function describeToolCall(name: string, input: Record<string, unknown>): string {
  const s = (k: string) => {
    const v = input[k];
    return typeof v === "string" ? v : String(v ?? "");
  };
  const has = (k: string) => input[k] !== undefined && input[k] !== null && input[k] !== "";

  switch (name) {
    case "walking_distance":
      return has("from_building") && has("to_building")
        ? `Searched for walking route from ${s("from_building")} to ${s("to_building")}`
        : "Searched for walking route";
    case "find_building":
      return has("query") ? `Searched for ${s("query")}` : "Searched for a building";
    case "find_courses": {
      // Any filter combination is valid; describe what was actually passed
      // instead of relying on query alone (subject-only searches would render
      // a dangling tail).
      const q = s("query");
      const subject = s("subject");
      let target = "courses";
      if (q) target = `courses matching "${q}"`;
      else if (subject) target = `${subject} courses`;
      else if (has("level")) target = `${s("level")}-level courses`;
      const suffix =
        input.has_no_prereqs === true
          ? " without prerequisites"
          : has("min_grade_avg") || has("max_grade_avg")
            ? " by average"
            : "";
      return `Searched ${target}${suffix}`;
    }
    case "get_course":
      return has("course_code") ? `Searched for ${s("course_code")}` : "Searched for a course";
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
      if (kind === "living") {
        const item = s("item");
        return item ? `Searched for ${item} costs` : "Searched for living costs";
      }
      return "Searched for costs";
    }
    case "find_places": {
      const isParking = s("category") === "parking";
      const noun = isParking ? "parking" : s("category") || "places";
      const q = s("query");
      const target = isParking && q ? `${noun} matching "${q}"` : !isParking && q ? q : noun;
      if (has("near_building")) return `Searched for ${target} near ${s("near_building")}`;
      return `Searched for ${target}`;
    }
    case "get_key_dates":
      return has("query") ? `Searched for ${s("query")} dates` : "Searched for key dates";
    case "find_events": {
      const q = s("query");
      let label = q ? `events matching "${q}"` : "events";
      if (has("from_date")) label += ` since ${s("from_date")}`;
      return `Searched for ${label}`;
    }
    case "find_programs": {
      const q = s("query");
      const degree = s("degree");
      if (q) return `Searched for programs matching "${q}"`;
      if (degree) return `Searched for ${degree} programs`;
      return "Searched for UBC programs";
    }
    case "find_study_spaces": {
      const place = s("query") || s("building");
      if (s("kind") === "bookable") {
        return place ? `Searched for free rooms in ${place}` : "Searched for free rooms";
      }
      if (has("min_capacity")) return `Searched for study spaces seating ${s("min_capacity")}+`;
      return place ? `Searched for study spaces near ${place}` : "Searched for study spaces";
    }
    case "get_admission_requirements":
      return has("program") ? `Searched admission requirements for ${s("program")}` : "Searched admission requirements";
    case "search_ubc_pages":
      return has("query") ? `Searched UBC pages for ${s("query")}` : "Searched UBC pages";
    case "get_prereq_tree":
      return has("course_code") ? `Searched prerequisite tree for ${s("course_code")}` : "Searched prerequisite tree";
    case "show_widget": {
      const type = s("type");
      if (type === "courses") {
        const n = Array.isArray(input.course_codes) ? input.course_codes.length : 0;
        return n > 0 ? `Showing ${n} courses` : "Showing course list";
      }
      if (type === "course") return has("course") ? `Showing ${s("course")}` : "Showing course";
      if (type === "grade_distribution") {
        return has("course") ? `Showing grades for ${s("course")}` : "Showing grade distribution";
      }
      if (type === "grades") return has("course") ? `Showing grades for ${s("course")}` : "Showing grades";
      if (type === "building") {
        const n = Array.isArray(input.buildings) ? input.buildings.length : 0;
        return n > 0 ? `Showing ${n} building${n > 1 ? "s" : ""}` : "Showing building";
      }
      if (type === "building_detail") {
        return has("building_code") ? `Showing details for ${s("building_code")}` : "Showing building details";
      }
      if (type === "building_entrances") {
        return has("building_code") ? `Showing entrances for ${s("building_code")}` : "Showing building entrances";
      }
      if (type === "building_spaces") {
        return has("building_code") ? `Showing rooms in ${s("building_code")}` : "Showing building rooms";
      }
      if (type === "route") {
        return has("from_building") && has("to_building")
          ? `Showing route from ${s("from_building")} to ${s("to_building")}`
          : "Showing route";
      }
      if (type === "tuition") {
        return has("program_slug") ? `Showing tuition for ${s("program_slug")}` : "Showing tuition";
      }
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
