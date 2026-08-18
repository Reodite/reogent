import type { Citation } from "@/src/shared/citations/citation";
import type { ChatMessage, InterstitialBlock, SessionSummary, ToolCall } from "../core/types";
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
  const session = await getPool().query(`SELECT id FROM sessions WHERE id = $1 AND user_id = $2`, [sessionId, userId]);
  if (session.rows.length === 0) return null;

  const { rows } = await getPool().query(
    `SELECT role, content, tool_calls, interstitial, citations FROM messages WHERE session_id = $1 ORDER BY id ASC`,
    [sessionId],
  );
  return rows.map((r) => {
    const msg: ChatMessage = { role: r.role, content: r.content };
    if (r.tool_calls) msg.toolCalls = r.tool_calls;
    if (r.interstitial) msg.interstitial = r.interstitial;
    msg.citations = r.citations === undefined ? null : r.citations;
    return msg;
  });
}

/** Persists one user + assistant exchange. Creates the session if it doesn't exist. */
export async function appendExchange(
  userId: string,
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
  toolCalls: ToolCall[],
  interstitial?: InterstitialBlock[],
  citations?: Citation[] | null,
): Promise<void> {
  const pool = getPool();

  // Upsert session. ON CONFLICT verifies user_id matches to prevent cross-user writes.
  await pool.query(
    `INSERT INTO sessions (id, user_id, title, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET updated_at = now()
     WHERE sessions.user_id = $2`,
    [sessionId, userId, userMessage.slice(0, 80)],
  );

  // Insert both messages. Citations are persisted on the assistant half only.
  await pool.query(
    `INSERT INTO messages (session_id, role, content, tool_calls, interstitial, citations) VALUES ($1, $2, $3, $4, $5, $6), ($1, $7, $8, $9, $10, $11)`,
    [
      sessionId,
      "user",
      userMessage,
      null,
      null,
      null,
      "assistant",
      assistantMessage,
      toolCalls.length ? JSON.stringify(toolCalls) : null,
      interstitial?.length ? JSON.stringify(interstitial) : null,
      citations && citations.length > 0 ? JSON.stringify(citations) : null,
    ],
  );
}

/** Updates the title of an existing session. */
export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await getPool().query(`UPDATE sessions SET title = $2 WHERE id = $1`, [sessionId, title]);
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
  const pool = getPool();
  const { rowCount } = await pool.query(`DELETE FROM sessions WHERE id = $1 AND user_id = $2`, [sessionId, userId]);
  if ((rowCount ?? 0) === 0) return false;
  await pool.query(`DELETE FROM messages WHERE session_id = $1`, [sessionId]);
  return true;
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
