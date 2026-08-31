import { requireUser } from "@/src/server/auth";
import { getPerson, savePerson } from "@/src/server/sharer/store";
import { json, requireJson, serverError } from "../../http";

// A full Workday schedule serializes to a few KB; the cap blocks abuse of
// the JSONB column rather than any real schedule.
const MAX_SCHEDULE_BYTES = 262_144;
const DAY_CODES = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isAvatar(value: unknown): boolean {
  if (!isRecord(value) || !["emoji", "initials", "image"].includes(String(value.kind))) return false;
  if (typeof value.color !== "string" || !/^#[0-9a-f]{6}$/i.test(value.color)) return false;
  if (value.kind === "emoji") return typeof value.emoji === "string" && value.emoji.length <= 16;
  if (value.kind === "initials") return typeof value.initials === "string" && value.initials.length <= 4;
  return typeof value.imageDataUrl === "string" && /^data:image\/(?:jpeg|png|webp);base64,/.test(value.imageDataUrl);
}

function isMeeting(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.days) || value.days.length === 0) return false;
  if (!value.days.every((day) => typeof day === "string" && DAY_CODES.has(day))) return false;
  if (!Number.isInteger(value.startMin) || !Number.isInteger(value.endMin)) return false;
  const startMin = value.startMin as number;
  const endMin = value.endMin as number;
  if (startMin < 0 || endMin > 1440 || startMin >= endMin) return false;
  return (
    typeof value.raw === "string" &&
    [value.campus, value.buildingName, value.buildingCode, value.floor, value.room].every(isOptionalString)
  );
}

function isSection(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (![value.id, value.courseCode, value.title, value.component].every((field) => typeof field === "string")) {
    return false;
  }
  if (!Array.isArray(value.instructors) || !value.instructors.every((name) => typeof name === "string")) return false;
  if (!Array.isArray(value.meetings) || value.meetings.length > 50 || !value.meetings.every(isMeeting)) return false;
  return isOptionalString(value.termStart) && isOptionalString(value.termEnd);
}

function isSchedule(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.sections) || value.sections.length > 500) return false;
  return (
    typeof value.importedAt === "string" && isOptionalString(value.sourceFileName) && value.sections.every(isSection)
  );
}

/** GET /api/sharer/schedule — the caller's person record, or `{ person: null }`. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    return json({ person: await getPerson(user.sub) });
  } catch (e) {
    return serverError(e);
  }
}

/** PUT /api/sharer/schedule — replaces the caller's person record. */
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
    if (!isRecord(body)) return json({ error: "Body must be an object" }, 400);
    const { handle, avatar, schedule } = body;
    if (typeof handle !== "string" || handle.trim().length === 0 || handle.length > 64) {
      return json({ error: "handle must be a 1-64 character string" }, 400);
    }
    if (!isAvatar(avatar)) return json({ error: "Invalid avatar" }, 400);
    if (!isSchedule(schedule)) return json({ error: "Invalid schedule" }, 400);

    const person = await savePerson(user.sub, {
      handle: handle.trim(),
      avatar,
      schedule,
    });
    return json({ person });
  } catch (e) {
    return serverError(e);
  }
}
