import type { AccountDetails, StudentProfile } from "@/src/shared/profile";
import { connectDatabase } from "./db";
import { OAuthAccount, PulseVote, User, UserProfile } from "./db/models";

/** Returns account details for the authenticated user, or null if the user no longer exists. */
export async function getAccount(userId: string): Promise<AccountDetails | null> {
  await connectDatabase();
  const user = await User.findById(userId).lean();
  if (!user) return null;
  const [oauth, profile, pulseQuestionsAnswered] = await Promise.all([
    OAuthAccount.findOne({ userId, isPrimary: true }).sort({ createdAt: 1 }).lean(),
    UserProfile.findById(userId).lean(),
    PulseVote.countDocuments({ userId }),
  ]);
  return {
    username: user.username,
    displayName: oauth?.displayName ?? null,
    email: oauth?.emailVerified ? (oauth.email ?? null) : null,
    createdAt: user.createdAt?.toISOString() ?? null,
    profile: (profile?.data as StudentProfile | undefined) ?? null,
    tokensSpent: user.tokensSpent,
    tokenTrackingStartedAt: user.tokenTrackingStartedAt.toISOString(),
    pulseQuestionsAnswered,
  };
}

/** Chat messages each account may send per Vancouver calendar day. */
export const DAILY_CHAT_LIMIT = 100;

function vancouverDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Atomically counts one chat message against today's allowance. Returns false
 * when the account has used its daily allowance or no longer exists. The
 * counter resets at midnight America/Vancouver.
 */
export async function consumeDailyChatMessage(userId: string): Promise<boolean> {
  await connectDatabase();
  const day = vancouverDay(new Date());
  const updated = await User.findOneAndUpdate(
    { _id: userId, $or: [{ chatDay: { $ne: day } }, { chatMessages: { $lt: DAILY_CHAT_LIMIT } }] },
    [
      {
        $set: {
          chatMessages: { $cond: [{ $eq: ["$chatDay", day] }, { $add: ["$chatMessages", 1] }, 1] },
          chatDay: day,
        },
      },
    ],
    { new: true, runValidators: true },
  ).lean();
  return updated !== null;
}

/** Adds provider-reported usage atomically; deleting a conversation does not erase the total. */
export async function recordTokenUsage(userId: string, totalTokens: number | undefined): Promise<void> {
  if (totalTokens === undefined || totalTokens === 0) return;
  if (!Number.isSafeInteger(totalTokens) || totalTokens < 0) throw new Error("Invalid token usage");
  await connectDatabase();
  await User.updateOne({ _id: userId }, { $inc: { tokensSpent: totalTokens } });
}
