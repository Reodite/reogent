import { fetchJson } from "@/src/lib/api";
import { ApiError } from "@/src/lib/api-types";
import { colorFor, initialsFor } from "./avatar";
import type { Avatar, Person, Schedule } from "./types";

/** Wire payload of /api/sharer — the server owns id/updatedAt. */
export interface WirePerson {
  id: string;
  handle: string;
  avatar: unknown;
  schedule: unknown | null;
  updatedAt: string;
}

export interface GroupDetail {
  code: string;
  name: string;
  createdBy: string;
  createdAt: string;
  members: WirePerson[];
}

export interface GroupSummary {
  code: string;
  name: string;
  memberCount: number;
  updatedAt: string;
}

function isAvatar(value: unknown): value is Avatar {
  if (!value || typeof value !== "object") return false;
  const a = value as Partial<Avatar>;
  return (a.kind === "emoji" || a.kind === "initials" || a.kind === "image") && typeof a.color === "string";
}

/**
 * Coerces a wire person into the calendar's Person. Members who never
 * uploaded keep a null schedule rendered as initials derived from their
 * handle.
 */
export function normalizePerson(wire: WirePerson, enabled = true): Person {
  const avatar: Avatar = isAvatar(wire.avatar)
    ? wire.avatar
    : { kind: "initials", initials: initialsFor(wire.handle || "??"), color: colorFor(wire.handle) };
  return {
    id: wire.id,
    handle: wire.handle,
    avatar,
    schedule: isSchedule(wire.schedule) ? wire.schedule : null,
    updatedAt: wire.updatedAt,
    enabled,
  };
}

/** Minimal shape check: the parser output is otherwise trusted (it round-trips our own JSON). */
function isSchedule(value: unknown): value is Schedule {
  return !!value && typeof value === "object" && Array.isArray((value as Schedule).sections);
}

/** Fetches /api/sharer with the app session's user id; throws ApiError(401) when signed out. */
export async function sharerFetch<T>(
  getUserId: () => Promise<string | null>,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const userId = await getUserId();
  if (!userId) throw new ApiError(401, "Not signed in");
  return fetchJson<T>(`/api/sharer${path}`, { ...init, headers: { ...init?.headers, "X-Reodite-User": userId } });
}
