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

/** Adds provider-reported usage atomically; deleting a conversation does not erase the total. */
export async function recordTokenUsage(userId: string, totalTokens: number | undefined): Promise<void> {
  if (totalTokens === undefined || totalTokens === 0) return;
  if (!Number.isSafeInteger(totalTokens) || totalTokens < 0) throw new Error("Invalid token usage");
  await getPool().query(`UPDATE users SET tokens_spent = tokens_spent + $2 WHERE id = $1`, [userId, totalTokens]);
}
