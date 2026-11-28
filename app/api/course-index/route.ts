import { getRateLimitIdentity, rateLimitResponse } from "@/src/server/rate-limit";
import { getSearch } from "@/src/server/search";
import { stripCampusSuffix } from "@/src/shared/course-code";
import type { CourseIndexEntry } from "@/src/shared/course-index";
import { serverError } from "../http";

const COURSE_INDEX_LIMIT = { windowMs: 60_000, maxRequests: Number(process.env.RATE_LIMIT_PREREQ) || 10 };
const PAGE = 5000;
const CACHE_TTL_MS = 60 * 60 * 1000;

let cache: Promise<string> | undefined;
let cacheLoadedAt: number | undefined;

async function loadIndex(): Promise<string> {
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
        code: stripCampusSuffix(doc.code),
        title: doc.title,
        credits: doc.credits ?? null,
        prerequisite: doc.prerequisite ?? null,
        corequisite: doc.corequisite ?? null,
      });
    }
    if (offset + res.results.length >= res.total) break;
  }
  out.sort((a, b) => a.code.localeCompare(b.code));
  return JSON.stringify({ courses: out });
}

/** GET /api/course-index — every course's code/title/prereq/coreq strings, sorted by code.
 *  The Prereq Tree pane loads this once and builds graphs + type-ahead suggestions client-side. */
export async function GET(request: Request): Promise<Response> {
  try {
    const ip = getRateLimitIdentity(request);
    const limited = rateLimitResponse(`course-index:${ip}`, COURSE_INDEX_LIMIT);
    if (limited) return limited;
    if (cacheLoadedAt !== undefined && Date.now() - cacheLoadedAt >= CACHE_TTL_MS) {
      cache = undefined;
      cacheLoadedAt = undefined;
    }
    cache ??= loadIndex()
      .catch((error) => {
        cache = undefined;
        cacheLoadedAt = undefined;
        throw error;
      })
      .then((result) => {
        cacheLoadedAt = Date.now();
        return result;
      });
    return new Response(await cache, {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
    });
  } catch (e) {
    return serverError(e);
  }
}
