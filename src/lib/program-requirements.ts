// Loads UBC degree-program metadata for the Degree Planner's program
// selector + requirements panel.
//
// Data files (all static scraper/curation output under /data):
//   program_registry.json    — curated list of selectable programs (one entry
//                              per credential variant, stable `id` per entry)
//   degree_programs.json     — raw scraped calendar records (prose fallback)
//   program_requirements.json— structured requirements overlay, keyed by
//                              registry id or calendar URL
//   degree_rules.json        — faculty-wide rules per degree container (BA,
//                              BSc, …): breadth, arts/science credit, upper-
//                              level minimums, communication requirements
//   subject_faculties.json   — subject code → owning faculty display name,
//                              used to evaluate faculty_credit rules
export interface DegreeRecord {
  url: string;
  title: string;
  program: string | null;
  faculty: string | null;
  level: "undergraduate" | "masters" | "doctoral" | "certificate" | string;
  kind: string;
  referenced_courses: string[];
  text: string;
}

export type RegistryKind =
  | "major"
  | "honours"
  | "combined_major"
  | "minor"
  | "stream"
  | "certificate"
  | "diploma"
  | "degree";

export interface RegistryEntry {
  id: string;
  url: string;
  title: string;
  faculty: string;
  degree: string;
  kind: RegistryKind;
  // Calendar URLs whose scraped text holds this program's requirements.
  source_urls: string[];
  notes?: string;
}

// Machine-checkable qualification rule for courses that satisfy a category
// without being individually enumerated ("12 Arts credits", "48 upper-level
// credits", the communication-requirement course list).
export interface CreditRule {
  kind: "faculty_credit" | "level_credit" | "course_list";
  faculty?: string;
  min_level?: number;
  include_courses?: string[];
  exclude_courses?: string[];
  include_subjects?: string[];
  exclude_subjects?: string[];
  courses?: string[];
  // Bound how many credits from the listed subjects may count toward the
  // category (e.g. max 8 credits of MUSC ensembles as BSc Arts credit).
  caps?: { credits: number; subjects: string[]; note?: string }[];
}

export interface CategoryOption {
  // Exact course code (e.g. "ENGL 100") OR subject_pattern (e.g. "ENGL 3"
  // = any 3xx ENGL course) OR a CreditRule. One of the three must be present.
  code?: string;
  subject_pattern?: string;
  credit_value?: number;
  rule?: CreditRule;
}

export interface RequirementCategory {
  name: string;
  credits_required: number;
  options: CategoryOption[];
  notes?: string;
  source_url?: string;
}

export interface StructuredRequirements {
  kind: "structured";
  program_url: string;
  total_credits?: number;
  categories: RequirementCategory[];
}

export interface ProseRequirements {
  kind: "prose";
  program_url: string;
  text: string;
  referenced_courses: string[];
}

export type ProgramRequirements = StructuredRequirements | ProseRequirements;

export interface DegreeRules {
  total_credits?: number;
  categories: RequirementCategory[];
}

export interface ProgramOption {
  id: string;
  url: string;
  title: string;
  // Display label; equals `title` unless two entries in the same faculty
  // share a title, in which case the degree container is appended.
  label: string;
  degree: string;
  kind: RegistryKind;
}

export interface ProgramIndex {
  faculties: string[];
  majorsByFaculty: Map<string, ProgramOption[]>;
  minorsByFaculty: Map<string, ProgramOption[]>;
  byId: Map<string, RegistryEntry>;
  byUrl: Map<string, DegreeRecord>;
}

let indexPromise: Promise<ProgramIndex> | null = null;
let overlayPromise: Promise<Map<string, StructuredRequirements>> | null = null;
let rulesPromise: Promise<Map<string, DegreeRules>> | null = null;
let subjectFacultyPromise: Promise<Record<string, string>> | null = null;

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Within one faculty bucket two entries can share a title (rare after
// curation, but e.g. a certificate and a diploma of the same name). Append
// the degree container to any repeated title so the selector never shows
// two identical labels.
function disambiguateLabels(list: ProgramOption[]): void {
  const counts = new Map<string, number>();
  for (const o of list) counts.set(o.title, (counts.get(o.title) ?? 0) + 1);
  for (const o of list) {
    if ((counts.get(o.title) ?? 0) > 1 && o.degree) {
      o.label = `${o.title} — ${o.degree}`;
    }
  }
}

export function getProgramIndex(): Promise<ProgramIndex> {
  if (!indexPromise) {
    indexPromise = (async () => {
      const [registry, records] = await Promise.all([
        fetchJson<RegistryEntry[]>("/data/program_registry.json"),
        fetchJson<DegreeRecord[]>("/data/degree_programs.json"),
      ]);
      if (!registry) throw new Error("program_registry.json failed to load");
      const byUrl = new Map<string, DegreeRecord>();
      for (const r of records ?? []) byUrl.set(r.url, r);

      const byId = new Map<string, RegistryEntry>();
      const majors = new Map<string, ProgramOption[]>();
      const minors = new Map<string, ProgramOption[]>();
      const facultySet = new Set<string>();
      for (const e of registry) {
        byId.set(e.id, e);
        facultySet.add(e.faculty);
        const opt: ProgramOption = {
          id: e.id,
          url: e.url,
          title: e.title,
          label: e.title,
          degree: e.degree,
          kind: e.kind,
        };
        const bucket = e.kind === "minor" ? minors : majors;
        const arr = bucket.get(e.faculty) ?? [];
        arr.push(opt);
        bucket.set(e.faculty, arr);
      }
      for (const list of majors.values()) {
        list.sort((a, b) => a.title.localeCompare(b.title));
        disambiguateLabels(list);
      }
      for (const list of minors.values()) {
        list.sort((a, b) => a.title.localeCompare(b.title));
        disambiguateLabels(list);
      }
      return {
        faculties: Array.from(facultySet).sort(),
        majorsByFaculty: majors,
        minorsByFaculty: minors,
        byId,
        byUrl,
      };
    })();
  }
  return indexPromise;
}

export function getRequirementsOverlay(): Promise<Map<string, StructuredRequirements>> {
  if (!overlayPromise) {
    overlayPromise = (async () => {
      const json = await fetchJson<Record<string, Omit<StructuredRequirements, "kind">>>(
        "/data/program_requirements.json",
      );
      const out = new Map<string, StructuredRequirements>();
      for (const [key, body] of Object.entries(json ?? {})) {
        out.set(key, { kind: "structured", ...body });
      }
      return out;
    })();
  }
  return overlayPromise;
}

/** Faculty-wide rules per degree container ("BA", "BSc", …). */
export function getDegreeRules(): Promise<Map<string, DegreeRules>> {
  if (!rulesPromise) {
    rulesPromise = (async () => {
      const json = await fetchJson<Record<string, DegreeRules>>("/data/degree_rules.json");
      return new Map(Object.entries(json ?? {}));
    })();
  }
  return rulesPromise;
}

/** Subject code ("ENGL") → owning faculty display name ("Faculty of Arts"). */
export function getSubjectFaculties(): Promise<Record<string, string>> {
  if (!subjectFacultyPromise) {
    subjectFacultyPromise = fetchJson<Record<string, string>>("/data/subject_faculties.json").then((j) => j ?? {});
  }
  return subjectFacultyPromise;
}

/**
 * Resolve a stored program value to a registry entry. Accepts a registry id
 * or a legacy calendar URL (plans saved before the registry existed stored
 * the URL; the first registry entry on that URL wins).
 */
export function resolveProgram(index: ProgramIndex, value: string | null): RegistryEntry | null {
  if (!value) return null;
  const byId = index.byId.get(value);
  if (byId) return byId;
  if (value.startsWith("http")) {
    for (const e of index.byId.values()) {
      if (e.url === value) return e;
    }
  }
  return null;
}

/**
 * Look up the requirements for a program. Accepts a registry id or legacy
 * URL. Structured overlay wins (keyed by id, then by the entry's URLs);
 * otherwise falls back to prose mode from the scraped record text.
 */
export async function getRequirementsFor(idOrUrl: string): Promise<ProgramRequirements | null> {
  const [index, overlay] = await Promise.all([getProgramIndex(), getRequirementsOverlay()]);
  const entry = resolveProgram(index, idOrUrl);
  const keys = entry ? [entry.id, entry.url, ...entry.source_urls] : [idOrUrl];
  for (const key of keys) {
    const structured = overlay.get(key);
    if (structured) return structured;
  }
  const urls = entry ? [entry.url, ...entry.source_urls] : [idOrUrl];
  for (const url of urls) {
    const record = index.byUrl.get(url);
    if (record) {
      return {
        kind: "prose",
        program_url: url,
        text: record.text,
        referenced_courses: record.referenced_courses ?? [],
      };
    }
  }
  return null;
}

/**
 * Match a single course code against a plain category option. Exact code
 * wins; a subject_pattern is a literal prefix match against the canonical
 * "SUBJ NUM" form ("ENGL 3" matches "ENGL 300" through "ENGL 399").
 * Rule options need context — see evaluateCategory.
 */
export function optionMatches(opt: CategoryOption, code: string): boolean {
  if (opt.code && opt.code === code) return true;
  if (opt.subject_pattern && code.startsWith(opt.subject_pattern)) return true;
  return false;
}

function courseLevel(code: string): number {
  const m = code.match(/\s(\d{3})/);
  return m ? Number(m[1]) : 0;
}

function subjectOf(code: string): string {
  return code.split(" ")[0] ?? "";
}

function facultyEq(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.replace(/^the\s+/i, "").toLowerCase();
  return norm(a) === norm(b);
}

/** Whether a course qualifies under a CreditRule, given the subject→faculty table. */
export function ruleMatches(rule: CreditRule, code: string, subjectFaculty: Record<string, string>): boolean {
  const subject = subjectOf(code);
  switch (rule.kind) {
    case "course_list":
      return (rule.courses ?? []).includes(code);
    case "level_credit":
      return courseLevel(code) >= (rule.min_level ?? 300);
    case "faculty_credit": {
      if (rule.include_courses?.includes(code)) return true;
      if (rule.exclude_courses?.includes(code)) return false;
      if (rule.exclude_subjects?.includes(subject)) return false;
      if (rule.include_subjects?.length) return rule.include_subjects.includes(subject);
      return facultyEq(subjectFaculty[subject], rule.faculty);
    }
  }
}

export interface PlannedCourse {
  code: string;
  credits: number;
}

export interface CategoryProgress {
  earned: number;
  matched: string[];
}

/**
 * Credits earned toward a category from the planned courses. Handles exact
 * codes, subject patterns, and CreditRules (including per-subject caps).
 * A category with no options earns nothing — it renders as advisory text.
 */
export function evaluateCategory(
  cat: RequirementCategory,
  planned: PlannedCourse[],
  subjectFaculty: Record<string, string>,
): CategoryProgress {
  const matched: { course: PlannedCourse; credit: number }[] = [];
  for (const course of planned) {
    const opt = cat.options.find(
      (o) => optionMatches(o, course.code) || (o.rule && ruleMatches(o.rule, course.code, subjectFaculty)),
    );
    if (opt) matched.push({ course, credit: opt.credit_value ?? course.credits });
  }
  // Apply subject caps from any rule option: clamp the total contribution of
  // each cap's subject set. ponytail: caps are per-category, first-match; no
  // cross-category double-count arbitration.
  let earned = matched.reduce((sum, m) => sum + m.credit, 0);
  for (const opt of cat.options) {
    for (const cap of opt.rule?.caps ?? []) {
      const capped = matched
        .filter((m) => cap.subjects.includes(subjectOf(m.course.code)))
        .reduce((sum, m) => sum + m.credit, 0);
      if (capped > cap.credits) earned -= capped - cap.credits;
    }
  }
  return { earned, matched: matched.map((m) => m.course.code) };
}
