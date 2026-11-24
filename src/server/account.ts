import type { AccountDetails, StudentProfile } from "@/src/shared/profile";
import { getPool } from "./db";

/** Returns account details for the authenticated user, or null if the user no longer exists. */
export async function getAccount(userId: string): Promise<AccountDetails | null> {
  const { rows } = await getPool().query<{
    username: string;
    created_at: Date | null;
    profile: StudentProfile | null;
    tokens_spent: string;
    token_tracking_started_at: Date;
    pulse_questions_answered: string;
  }>(
    `SELECT u.username, u.created_at, p.data AS profile, u.tokens_spent, u.token_tracking_started_at,
            (SELECT COUNT(*) FROM pulse_votes WHERE user_id = u.id) AS pulse_questions_answered
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    username: row.username,
    createdAt: row.created_at?.toISOString() ?? null,
    profile: row.profile,
    tokensSpent: Number(row.tokens_spent),
    tokenTrackingStartedAt: row.token_tracking_started_at.toISOString(),
    pulseQuestionsAnswered: Number(row.pulse_questions_answered),
  };
}

/** Chat messages each account may send per Vancouver calendar day. */
export const DAILY_CHAT_LIMIT = 10;

/**
 * Atomically counts one chat message against today's allowance. Returns false
 * when the account has used its daily allowance or no longer exists. The
 * counter resets at midnight America/Vancouver.
 */
export async function consumeDailyChatMessage(userId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `WITH today AS (SELECT (now() AT TIME ZONE 'America/Vancouver')::date AS day)
     UPDATE users
     SET chat_messages = CASE WHEN chat_day = today.day THEN chat_messages + 1 ELSE 1 END,
         chat_day = today.day
     FROM today
     WHERE id = $1 AND (chat_day IS DISTINCT FROM today.day OR chat_messages < $2)`,
    [userId, DAILY_CHAT_LIMIT],
  );
  return (rowCount ?? 0) > 0;
}

/** Adds provider-reported usage atomically; deleting a conversation does not erase the total. */
export async function recordTokenUsage(userId: string, totalTokens: number | undefined): Promise<void> {
  if (totalTokens === undefined || totalTokens === 0) return;
  if (!Number.isSafeInteger(totalTokens) || totalTokens < 0) throw new Error("Invalid token usage");
  await getPool().query(`UPDATE users SET tokens_spent = tokens_spent + $2 WHERE id = $1`, [userId, totalTokens]);
}
