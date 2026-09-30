import type { Citation } from "@/src/shared/citations/citation";
import type { ActivityBlock, ChatMessage, SessionSummary } from "../core/types";
import { getPool } from "../db";

/** Sessions for this user, most recently updated first. */
export async function listSessions(userId: string): Promise<SessionSummary[]> {
  const { rows } = await getPool().query(
    `SELECT id, title, updated_at FROM sessions WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    session_id: r.id,
    title: r.title,
    updatedAt: r.updated_at.toISOString(),
  }));
}

/** Chronological message history, or null if the session doesn't belong to this user. */
export async function getSessionMessages(userId: string, sessionId: string): Promise<ChatMessage[] | null> {
  const { rows } = await getPool().query(
    `SELECT m.role, m.content, m.activity, m.citations
     FROM sessions s LEFT JOIN messages m ON m.session_id = s.id
     WHERE s.id = $1 AND s.user_id = $2 ORDER BY m.id ASC`,
    [sessionId, userId],
  );
  if (rows.length === 0) return null;
  return rows
    .filter((row) => row.role !== null)
    .map((r) => {
      const msg: ChatMessage = { role: r.role, content: r.content };
      if (r.activity) msg.activity = r.activity;
      msg.citations = r.citations === undefined ? null : r.citations;
      return msg;
    });
}

/** Allows a new or owned session. Persistence must recheck ownership atomically. */
export async function canWriteSession(userId: string, sessionId: string): Promise<boolean> {
  const { rows } = await getPool().query(`SELECT user_id FROM sessions WHERE id = $1`, [sessionId]);
  return rows.length === 0 || rows[0].user_id === userId;
}

/** Atomically persists a paired exchange, creating new sessions and rejecting non-owners. */
export async function appendExchange(
  userId: string,
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
  activity?: ActivityBlock[],
  citations?: Citation[] | null,
): Promise<void> {
  const { rowCount } = await getPool().query(
    `WITH owned_session AS (
       INSERT INTO sessions (id, user_id, title, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET updated_at = now()
       WHERE sessions.user_id = $2
       RETURNING id
     )
     INSERT INTO messages (session_id, role, content, activity, citations)
     SELECT owned_session.id, exchange.role, exchange.content, exchange.activity, exchange.citations
     FROM owned_session
     CROSS JOIN (VALUES
       (0, 'user', $4::text, NULL::jsonb, NULL::jsonb),
       (1, 'assistant', $5::text, $6::jsonb, $7::jsonb)
     ) AS exchange(position, role, content, activity, citations)
     ORDER BY exchange.position`,
    [
      sessionId,
      userId,
      userMessage.slice(0, 80),
      userMessage,
      assistantMessage,
      activity?.length ? JSON.stringify(activity) : null,
      citations && citations.length > 0 ? JSON.stringify(citations) : null,
    ],
  );
  if (rowCount === 0) throw new Error("Session not found");
}

/** Updates the title only if the session belongs to this user. */
export async function updateSessionTitle(userId: string, sessionId: string, title: string): Promise<void> {
  await getPool().query(`UPDATE sessions SET title = $2 WHERE id = $1 AND user_id = $3`, [sessionId, title, userId]);
}

/** Renames a session. Returns false if session doesn't belong to user. */
export async function renameSession(userId: string, sessionId: string, title: string): Promise<boolean> {
  const { rowCount } = await getPool().query(`UPDATE sessions SET title = $2 WHERE id = $1 AND user_id = $3`, [
    sessionId,
    title,
    userId,
  ]);
  return (rowCount ?? 0) > 0;
}

/** Deletes a session and its messages. Returns false if session doesn't belong to user. */
export async function deleteSession(userId: string, sessionId: string): Promise<boolean> {
  // The foreign key cascades message deletion in this ownership-checked statement.
  const { rowCount } = await getPool().query(`DELETE FROM sessions WHERE id = $1 AND user_id = $2`, [
    sessionId,
    userId,
  ]);
  return (rowCount ?? 0) > 0;
}

// --- User management (for auth) ---

export async function createUser(username: string, passwordHash: string): Promise<string> {
  const { rows } = await getPool().query(`INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id`, [
    username,
    passwordHash,
  ]);
  return rows[0].id;
}

export async function getUserByUsername(username: string): Promise<{ id: string; passwordHash: string } | null> {
  const { rows } = await getPool().query(`SELECT id, password_hash FROM users WHERE username = $1`, [username]);
  if (rows.length === 0) return null;
  return { id: rows[0].id, passwordHash: rows[0].password_hash };
}
