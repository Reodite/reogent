import { randomInt } from "node:crypto";
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

export interface OAuthProfileClaims {
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  avatarUrl?: string;
}

/** Returns the account linked to a provider identity, creating one on first sign-in. */
export async function findOrCreateOAuthUser(
  provider: string,
  providerSubject: string,
  profile: OAuthProfileClaims,
): Promise<{ id: string; username: string }> {
  const base =
    (profile.displayName ?? provider)
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .toLowerCase()
      .slice(0, 32) || "student";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [provider, providerSubject]);
    const { rows: existing } = await client.query(
      `SELECT u.id, u.username
       FROM oauth_accounts oa JOIN users u ON u.id = oa.user_id
       WHERE oa.provider = $1 AND oa.provider_subject = $2`,
      [provider, providerSubject],
    );
    let user = existing[0] as { id: string; username: string } | undefined;
    if (!user) {
      for (let attempt = 0; attempt < 5 && !user; attempt++) {
        const candidate = `${base}-${randomInt(1000, 10_000)}`;
        const { rows } = await client.query(
          `INSERT INTO users (username) VALUES ($1) ON CONFLICT (username) DO NOTHING RETURNING id, username`,
          [candidate],
        );
        user = rows[0];
      }
      if (!user) throw new Error("Could not allocate a username for the OAuth account");
      await client.query(
        `INSERT INTO oauth_accounts (user_id, provider, provider_subject, is_primary)
         VALUES ($1, $2, $3, true)`,
        [user.id, provider, providerSubject],
      );
    }
    await client.query(
      `INSERT INTO oauth_profiles (oauth_account_id, email, email_verified, display_name, avatar_url)
       SELECT id, $3, $4, $5, $6 FROM oauth_accounts
       WHERE provider = $1 AND provider_subject = $2
       ON CONFLICT (oauth_account_id) DO UPDATE
       SET email = EXCLUDED.email,
           email_verified = EXCLUDED.email_verified,
           display_name = COALESCE(EXCLUDED.display_name, oauth_profiles.display_name),
           avatar_url = COALESCE(EXCLUDED.avatar_url, oauth_profiles.avatar_url),
           updated_at = now()`,
      [
        provider,
        providerSubject,
        profile.email ?? null,
        profile.emailVerified ?? false,
        profile.displayName ?? null,
        profile.avatarUrl ?? null,
      ],
    );
    await client.query("COMMIT");
    return user;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
