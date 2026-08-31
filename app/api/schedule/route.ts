import { requireUser } from "@/src/server/auth";
import { getSchedule, saveSchedule } from "@/src/server/schedules";
import { json, requireJson, serverError } from "../http";

// Generous ceiling for a serialized schedule (a few terms of picked sections
// is a few KB); blocks arbitrary-blob abuse of the JSONB column.
const MAX_SCHEDULE_BYTES = 262_144;
const MAX_ENTRIES = 100;
const MAX_CODE_LENGTH = 32;
const MAX_SECTION_LENGTH = 16;
const MAX_TERM_LENGTH = 100;

// A picked section identified by course code + section code, tagged with its
// term name so the client can group without resolving courses first.
interface ScheduleEntry {
  code: string;
  section: string;
  term: string;
}

function isValidEntry(e: unknown): e is ScheduleEntry {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.code === "string" &&
    o.code.trim().length > 0 &&
    o.code.length <= MAX_CODE_LENGTH &&
    typeof o.section === "string" &&
    o.section.trim().length > 0 &&
    o.section.length <= MAX_SECTION_LENGTH &&
    typeof o.term === "string" &&
    o.term.trim().length > 0 &&
    o.term.length <= MAX_TERM_LENGTH
  );
}

function canonicalCode(code: string): string {
  return code.toUpperCase().replace(/_V(?=\s)/, "").replace(/\s+/g, " ").trim();
}

/** GET /api/schedule — the caller's saved schedule, or `{ schedule: null }`. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    return json({ schedule: await getSchedule(user.sub) });
  } catch (e) {
    return serverError(e);
  }
}

/** PUT /api/schedule — replaces the caller's saved schedule. */
export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const ctError = requireJson(request);
    if (ctError) return ctError;

    const text = await request.text();
    if (text.length > MAX_SCHEDULE_BYTES) return json({ error: "Schedule too large" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    // Shape check — second-level fields are populated client-side and
    // re-resolved against the catalog on read.
    if (
      !body ||
      typeof body !== "object" ||
      !Array.isArray((body as { entries?: unknown }).entries) ||
      (body as { entries: unknown[] }).entries.length > MAX_ENTRIES ||
      !(body as { entries: unknown[] }).entries.every(isValidEntry) ||
      ("activeTerm" in body &&
        (typeof (body as { activeTerm?: unknown }).activeTerm !== "string" ||
          ((body as { activeTerm: string }).activeTerm.length > MAX_TERM_LENGTH)))
    ) {
      return json(
        { error: `Body must be a schedule object with an entries array (max ${MAX_ENTRIES}) of { code, section, term }` },
        400,
      );
    }

    const parsed = body as { entries: ScheduleEntry[]; activeTerm?: string };
    const schedule = {
      entries: parsed.entries.map(({ code, section, term }) => ({
        code: canonicalCode(code),
        section: section.trim(),
        term: term.trim(),
      })),
      activeTerm: parsed.activeTerm?.trim() ?? "",
    };
    await saveSchedule(user.sub, schedule);
    return new Response(null, { status: 204 });
  } catch (e) {
    return serverError(e);
  }
}
