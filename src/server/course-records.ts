/** Per-session course record derived from grade distributions (Vancouver only). */

export const BUCKET_KEYS = [
  "<50",
  "50-54",
  "55-59",
  "60-63",
  "64-67",
  "68-71",
  "72-75",
  "76-79",
  "80-84",
  "85-89",
  "90-100",
] as const;

export type BucketKey = (typeof BUCKET_KEYS)[number];

/** Canonical session set: winter/summer per year. Largest YYYYW is the default. */
export const SESSIONS = [
  "2021S",
  "2021W",
  "2022S",
  "2022W",
  "2023S",
  "2023W",
  "2024S",
  "2024W",
  "2025S",
  "2025W",
] as const;
export type Session = (typeof SESSIONS)[number];

const SESSION_SET = new Set<string>(SESSIONS as unknown as string[]);

export function isSession(v: unknown): v is Session {
  return typeof v === "string" && SESSION_SET.has(v);
}

export function latestWinterSession(sessions: readonly string[] = [...SESSIONS]): string {
  const winters = sessions.filter((s) => s.endsWith("W"));
  if (winters.length === 0) return sessions[sessions.length - 1] ?? "2025W";
  return [...winters].sort().at(-1)!;
}

export function defaultSession(): Session {
  return latestWinterSession() as Session;
}

/** Grade thresholds mirroring the 11-bucket chart colour bands. */
export function gradeClass(avg: number | null | undefined): string {
  const v = typeof avg === "number" && Number.isFinite(avg) ? avg : -1;
  if (v >= 90) return "excellent-average";
  if (v >= 85) return "great-average";
  if (v >= 80) return "good-average";
  if (v >= 70) return "fair-average";
  if (v >= 60) return "bad-average";
  return "horrible-average";
}

export function getTermLabel(term: unknown): string {
  if (term === undefined || term === null) return "N/A";
  if (typeof term === "number") return term === 1 ? "1" : "2";
  if (typeof term === "string") return term === "1-2" ? "Both" : term;
  if (Array.isArray(term)) {
    const has1 = (term as unknown[]).includes(1);
    const has2 = (term as unknown[]).includes(2);
    if (has1 && has2) return "1,2";
    if (has1) return "1";
    if (has2) return "2";
  }
  return "N/A";
}

function parseLevel(code: string): number | null {
  const m = code.match(/\d{3}/);
  return m ? Math.floor(Number.parseInt(m[0], 10) / 100) * 100 : null;
}

export interface CourseRecord {
  code: string; // "MATH 100"
  subject: string; // "MATH_V"
  number: string; // "100"
  level: number | null;
  title: string;
  description: string | null;
  faculty: string | null;
  session: Session;
  term: unknown;
  credits: number | null;
  prerequisites: string[] | null;
  average: number;
  reported: number;
  weightedMedian: number | null;
  p25: number | null;
  p75: number | null;
  high: number | null;
  low: number | null;
  mode: string | null;
  stdDev: number | null;
  buckets: Record<BucketKey, number>;
  // Meilisearch primary key
  id: string;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function courseRecordId(code: string, session: Session): string {
  return sanitizeId(`${code}__${session}`);
}

// Raw shape of grades/distributions.json (minimal fields we aggregate)
type DistRow = {
  subject: string;
  course: string;
  year: number;
  session: string;
  title: string;
  enrolled: number;
  avg: number | null;
  median: number | null;
  percentile_25: number | null;
  percentile_75: number | null;
  high: number | null;
  low: number | null;
  std_dev: number | null;
  distribution: Record<string, number>;
};

// Calendar subjects for faculty/title lookup (optional enrichment)
export type SubjectRow = { id: string; name: string; description?: string | null };
export type CourseCalRow = {
  field_course_number: unknown;
  field_course_title?: string;
  description_text?: string;
  prerequisite?: string;
  related?: { course_code?: string };
};

function facultyOfSubject(subjectV: string, subjectRows: SubjectRow[]): string | null {
  const hit = subjectRows.find((s) => s.name === subjectV);
  void hit;
  return null;
}

/**
 * Build Vancouver per-session records by aggregating grade distributions by
 * (subject, course, session). Each row's `average` is enrollment-weighted
 * across its sections for that session; buckets are summed.
 */
export function buildRecordsFromDistributions(opts: {
  distRows: DistRow[];
  calCourses?: CourseCalRow[];
  calSubjects?: SubjectRow[];
}): CourseRecord[] {
  const byKey = new Map<string, DistRow[]>();
  for (const r of opts.distRows) {
    if (r.avg === null && Object.values(r.distribution ?? {}).every((v) => v === 0)) continue;
    const key = `${r.subject} ${r.course}__${r.year}${r.session}`;
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }

  // Calendar lookup: code -> { title, description, prerequisite } for enrichment
  const calByCode = new Map<string, CourseCalRow>();
  if (opts.calCourses && opts.calSubjects) {
    const nameById = new Map(opts.calSubjects.map((s) => [s.id, s.name]));
    for (const row of opts.calCourses) {
      const subj = nameById.get(row.related?.course_code ?? "");
      const num = row.field_course_number;
      if (!subj || num == null) continue;
      const code = `${subj} ${String(num)}`;
      if (!calByCode.has(code)) calByCode.set(code, row);
    }
  }

  const out: CourseRecord[] = [];
  for (const [key, rows] of byKey) {
    const [codePart, sess] = key.split("__");
    const [subjectRaw, number] = codePart.split(" ");
    const subject = `${subjectRaw}_V`;
    const session = sess as Session;
    if (!isSession(session)) continue;

    let weightedSum = 0;
    let total = 0;
    let medianSum = 0;
    let medianN = 0;
    let p25: number | null = null;
    let p75: number | null = null;
    let high: number | null = null;
    let low: number | null = null;
    let mode: string | null = null;
    let stdDev: number | null = null;
    // Use first non-null per-field; distributions fill best-effort pooled stats.
    for (const r of rows) {
      if (r.avg !== null) {
        weightedSum += r.avg * r.enrolled;
        total += r.enrolled;
      }
      if (r.median !== null) {
        medianSum += r.median;
        medianN++;
      }
      if (p25 === null && r.percentile_25 !== null) p25 = r.percentile_25;
      if (p75 === null && r.percentile_75 !== null) p75 = r.percentile_75;
      if (high === null && r.high !== null) high = r.high;
      if (low === null && r.low !== null) low = r.low;
      if (stdDev === null && r.std_dev !== null) stdDev = r.std_dev;
    }
    const average = total > 0 ? Math.round((weightedSum / total) * 100) / 100 : 0;
    const weightedMedian = medianN > 0 ? Math.round((medianSum / medianN) * 10) / 10 : null;
    // Mode is the bucket with max count after summation
    const buckets = Object.fromEntries(BUCKET_KEYS.map((k) => [k, 0])) as Record<BucketKey, number>;
    for (const r of rows) {
      for (const k of BUCKET_KEYS) buckets[k] += r.distribution?.[k] ?? 0;
    }
    let maxK: BucketKey | null = null;
    let maxV = -1;
    for (const k of BUCKET_KEYS) {
      if (buckets[k] > maxV) {
        maxV = buckets[k];
        maxK = k;
      }
    }
    mode = maxK;

    const cal = calByCode.get(codePart) ?? calByCode.get(`${subject} ${number}`);
    const code = `${subjectRaw} ${number}`;
    out.push({
      code,
      subject,
      number,
      level: parseLevel(code),
      title: rows[0]?.title ?? cal?.field_course_title ?? code,
      description: (cal?.description_text as string) ?? null,
      faculty: facultyOfSubject(subject, opts.calSubjects ?? []),
      session,
      term: null,
      credits: null,
      prerequisites: null,
      average,
      reported: total,
      weightedMedian,
      p25,
      p75,
      high,
      low,
      mode,
      stdDev,
      buckets,
      id: courseRecordId(code, session),
    });
  }
  return out;
}

/** Faculty display name without the honorary-science suffix (mirrors dataService.getBaseFaculty). */
export function baseFaculty(faculty: string): string {
  return faculty.replace(" (Honorary Science Credit)", "");
}
