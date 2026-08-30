import { rateLimitResponse } from "@/src/server/rate-limit";
import { getSearch } from "@/src/server/search";
import { serverError } from "../http";

/** One course in the client-side index the Prereq Tree builds its graph from.
 *  `code` is canonical "CPSC 110" (no `_V` suffix) so it matches the codes the
 *  prereq-AST parser emits. */
export type CourseIndexEntry = {
  code: string;
  title: string;
  credits: number | null;
  prerequisite: string | null;
  corequisite: string | null;
};

const COURSE_INDEX_LIMIT = { windowMs: 60_000, maxRequests: Number(process.env.RATE_LIMIT_PREREQ) || 10 };
const PAGE = 5000;

let cache: CourseIndexEntry[] | null = null;

async function loadIndex(): Promise<CourseIndexEntry[]> {
  if (cache) return cache;
  const index = getSearch().index("courses");
  const out: CourseIndexEntry[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await index.getDocuments<{
      code: string;
      title: string;
      credits: number | null;
      prerequisite: string | null;
      corequisite: string | null;
    }>({ fields: ["code", "title", "credits", "prerequisite", "corequisite"], limit: PAGE, offset });
    for (const doc of res.results) {
      out.push({
        code: doc.code.replace(/_V(?=\s)/, ""),
        title: doc.title,
        credits: doc.credits ?? null,
        prerequisite: doc.prerequisite ?? null,
        corequisite: doc.corequisite ?? null,
      });
    }
    if (offset + res.results.length >= res.total) break;
  }
  out.sort((a, b) => a.code.localeCompare(b.code));
  cache = out;
  return out;
}

/** GET /api/course-index — every course's code/title/prereq/coreq strings, sorted by code.
 *  The Prereq Tree pane loads this once and builds graphs + type-ahead suggestions client-side. */
export async function GET(request: Request): Promise<Response> {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limited = rateLimitResponse(`course-index:${ip}`, COURSE_INDEX_LIMIT);
    if (limited) return limited;
    const courses = await loadIndex();
    return new Response(JSON.stringify({ courses }), {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
    });
  } catch (e) {
    return serverError(e);
  }
}
