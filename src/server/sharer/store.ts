// Schedule-sharer persistence. A person's schedule is one opaque JSONB blob
// per user (sharer_schedules); groups are named, joinable collections with a
// 6-char base62 code that acts as the share link (`/pulse/schedule/<code>`).
import { randomInt } from "node:crypto";
import { getPool } from "../db";

const CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CODE_LENGTH = 6;
/** Retries if a freshly drawn 6-char code collides with an existing group. */
const CODE_ATTEMPTS = 8;

/** A person as shared inside a group: identity + parsed Workday schedule. */
export interface SharerPerson {
  id: string;
  handle: string;
  avatar: unknown;
  schedule: unknown | null;
  updatedAt: string;
}

export interface GroupSummary {
  code: string;
  name: string;
  memberCount: number;
  updatedAt: string;
}

export interface GroupDetail {
  code: string;
  name: string;
  createdBy: string;
  createdAt: string;
  members: SharerPerson[];
}

function drawCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** The caller's person record, or null before their first upload. */
export async function getPerson(userId: string): Promise<SharerPerson | null> {
  const { rows } = await getPool().query(`SELECT person FROM sharer_schedules WHERE user_id = $1`, [userId]);
  return rows.length > 0 ? (rows[0].person as SharerPerson) : null;
}

/** Upserts the caller's person record. The server owns id/updatedAt. */
export async function savePerson(userId: string, body: { handle: string; avatar: unknown; schedule: unknown }) {
  const person: SharerPerson = {
    id: userId,
    handle: body.handle,
    avatar: body.avatar,
    schedule: body.schedule,
    updatedAt: new Date().toISOString(),
  };
  await getPool().query(
    `INSERT INTO sharer_schedules (user_id, person, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET person = EXCLUDED.person, updated_at = now()`,
    [userId, JSON.stringify(person)],
  );
  return person;
}

/**
 * Creates a group owned and auto-joined by the caller. Retries a handful of
 * fresh codes on the (rare) collision with an existing 6-char code.
 */
export async function createGroup(ownerId: string, name: string): Promise<GroupDetail | null> {
  const pool = getPool();
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = drawCode();
    try {
      await pool.query(
        `WITH new_group AS (
           INSERT INTO sharer_groups (code, name, created_by) VALUES ($1, $2, $3)
           RETURNING code
         )
         INSERT INTO sharer_group_members (group_code, user_id)
         SELECT code, $3 FROM new_group`,
        [code, name, ownerId],
      );
      return {
        code,
        name,
        createdBy: ownerId,
        createdAt: new Date().toISOString(),
        members: (await getGroup(code))?.members ?? [],
      };
    } catch (e) {
      // unique violation on the drawn code: retry with a fresh one
      if (typeof e === "object" && e !== null && (e as { code?: string }).code === "23505") continue;
      throw e;
    }
  }
  return null;
}

/** Validates code shape before it hits the DB, keeping queries cheap. */
export const CODE_PATTERN = /^[0-9A-Za-z]{6}$/;

type GroupsRow = { code: string; name: string; created_at: Date; member_count: number };

/** Groups the caller belongs to, newest first. */
export async function listGroups(userId: string): Promise<GroupSummary[]> {
  const { rows } = await getPool().query(
    `SELECT g.code, g.name, g.created_at, COUNT(m2.*)::int AS member_count
     FROM sharer_groups g
     JOIN sharer_group_members m ON m.group_code = g.code AND m.user_id = $1
     JOIN sharer_group_members m2 ON m2.group_code = g.code
     GROUP BY g.code, g.name, g.created_at
     ORDER BY g.created_at DESC`,
    [userId],
  );
  return rows.map((r: GroupsRow) => ({
    code: r.code,
    name: r.name,
    memberCount: r.member_count,
    updatedAt: r.created_at.toISOString(),
  }));
}

/**
 * A group with its members' person records. Members who joined but never
 * uploaded a schedule still appear, keyed by their username, with a null
 * schedule.
 */
export async function getGroup(code: string): Promise<GroupDetail | null> {
  const pool = getPool();
  const { rows: groups } = await pool.query(
    `SELECT code, name, created_by, created_at FROM sharer_groups WHERE code = $1`,
    [code],
  );
  if (groups.length === 0) return null;
  const g = groups[0];

  const { rows: members } = await pool.query(
    `SELECT m.user_id, u.username, m.joined_at, s.person
     FROM sharer_group_members m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN sharer_schedules s ON s.user_id = m.user_id
     WHERE m.group_code = $1
     ORDER BY m.joined_at`,
    [code],
  );
  return {
    code: g.code,
    name: g.name,
    createdBy: g.created_by,
    createdAt: (g.created_at as Date).toISOString(),
    members: members.map((m) =>
      m.person
        ? (m.person as SharerPerson)
        : { id: m.user_id, handle: m.username, avatar: null, schedule: null, updatedAt: m.joined_at.toISOString() },
    ),
  };
}

/** Returns group detail only when the caller is already a member. */
export async function getGroupForMember(userId: string, code: string): Promise<GroupDetail | null> {
  const { rowCount } = await getPool().query(
    `SELECT 1 FROM sharer_group_members WHERE group_code = $1 AND user_id = $2`,
    [code, userId],
  );
  return rowCount ? getGroup(code) : null;
}

/**
 * Adds the caller to a group. Null when the code is unknown; otherwise the
 * group detail (idempotent — rejoining is a no-op).
 */
export async function joinGroup(userId: string, code: string): Promise<GroupDetail | null> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `INSERT INTO sharer_group_members (group_code, user_id)
     SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM sharer_groups WHERE code = $1)
     ON CONFLICT DO NOTHING`,
    [code, userId],
  );
  // A no-op conflict still means the group exists; report it.
  if (rowCount === 0 && !(await pool.query(`SELECT 1 FROM sharer_groups WHERE code = $1`, [code])).rowCount)
    return null;
  return getGroup(code);
}

/** Removes the caller from a group. False when they were not a member. */
export async function leaveGroup(userId: string, code: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `DELETE FROM sharer_group_members WHERE group_code = $1 AND user_id = $2`,
    [code, userId],
  );
  return rowCount === 1;
}
