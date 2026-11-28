import { randomInt } from "node:crypto";
import type { Citation } from "@/src/shared/citations/citation";
import type { ActivityBlock, ChatMessage, SessionSummary } from "../core/types";
import { connectDatabase } from "../db";
import { Message, OAuthAccount, Session, User } from "../db/models";

/** Sessions for this user, most recently updated first. */
export async function listSessions(userId: string): Promise<SessionSummary[]> {
  await connectDatabase();
  const sessions = await Session.find({ userId }).sort({ updatedAt: -1 }).lean();
  return sessions.map((session) => ({
    session_id: session._id,
    title: session.title ?? "",
    updatedAt: session.updatedAt.toISOString(),
  }));
}

/** Chronological message history, or null if the session doesn't belong to this user. */
export async function getSessionMessages(userId: string, sessionId: string): Promise<ChatMessage[] | null> {
  await connectDatabase();
  const mongoSession = await Session.startSession();
  let messages: { role: "user" | "assistant"; content: string; activity?: unknown; citations?: unknown }[] | null;
  try {
    messages = await mongoSession.withTransaction(async () => {
      const owned = await Session.exists({ _id: sessionId, userId }).session(mongoSession).lean();
      if (!owned) return null;
      return Message.find({ sessionId }).sort({ order: 1 }).session(mongoSession).lean();
    });
  } finally {
    await mongoSession.endSession();
  }
  if (!messages) return null;
  return messages.map((message) => {
    const result: ChatMessage = { role: message.role, content: message.content };
    if (message.activity) result.activity = message.activity as ActivityBlock[];
    result.citations = (message.citations as Citation[] | null) ?? null;
    return result;
  });
}

/** Allows a new or owned session. Persistence must recheck ownership atomically. */
export async function canWriteSession(userId: string, sessionId: string): Promise<boolean> {
  await connectDatabase();
  const session = await Session.findById(sessionId).select({ userId: 1 }).lean();
  return !session || session.userId === userId;
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
  await connectDatabase();
  try {
    await appendExchangeTransaction(userId, sessionId, userMessage, assistantMessage, activity, citations);
  } catch (error) {
    if (!isSessionIdDuplicate(error, sessionId)) throw error;
    const existing = await findSessionOwnerAfterDuplicate(sessionId);
    if (existing !== userId) throw new Error("Session not found");
    await appendExchangeTransaction(userId, sessionId, userMessage, assistantMessage, activity, citations);
  }
}

function isSessionIdDuplicate(error: unknown, sessionId: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== 11000) return false;
  const duplicate = error as { keyPattern?: Record<string, unknown>; keyValue?: Record<string, unknown> };
  return duplicate.keyPattern?._id === 1 || duplicate.keyValue?._id === sessionId;
}

async function findSessionOwnerAfterDuplicate(sessionId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await Session.findById(sessionId).select({ userId: 1 }).lean();
    if (existing) return existing.userId;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
  }
  return null;
}

async function appendExchangeTransaction(
  userId: string,
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
  activity?: ActivityBlock[],
  citations?: Citation[] | null,
): Promise<void> {
  const mongoSession = await Session.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      const now = new Date();
      const owned = await Session.findOneAndUpdate(
        { _id: sessionId, userId },
        { $inc: { nextMessageOrder: 2 }, $set: { updatedAt: now } },
        { returnDocument: "after", session: mongoSession },
      );
      if (owned) {
        await Message.create(
          [
            { sessionId, order: owned.nextMessageOrder - 2, role: "user", content: userMessage },
            {
              sessionId,
              order: owned.nextMessageOrder - 1,
              role: "assistant",
              content: assistantMessage,
              activity: activity?.length ? activity : null,
              citations: citations?.length ? citations : null,
            },
          ],
          { ordered: true, session: mongoSession },
        );
        return;
      }

      const exists = await Session.exists({ _id: sessionId }).session(mongoSession).lean();
      if (exists) throw new Error("Session not found");
      await Session.create(
        [{ _id: sessionId, userId, title: userMessage.slice(0, 80), updatedAt: now, nextMessageOrder: 2 }],
        { ordered: true, session: mongoSession },
      );
      await Message.create(
        [
          { sessionId, order: 0, role: "user", content: userMessage },
          {
            sessionId,
            order: 1,
            role: "assistant",
            content: assistantMessage,
            activity: activity?.length ? activity : null,
            citations: citations?.length ? citations : null,
          },
        ],
        { ordered: true, session: mongoSession },
      );
    });
  } finally {
    await mongoSession.endSession();
  }
}

/** Updates the title only if the session belongs to this user. */
export async function updateSessionTitle(userId: string, sessionId: string, title: string): Promise<void> {
  await connectDatabase();
  await Session.updateOne({ _id: sessionId, userId }, { $set: { title } });
}

/** Renames a session. Returns false if session doesn't belong to user. */
export async function renameSession(userId: string, sessionId: string, title: string): Promise<boolean> {
  await connectDatabase();
  const result = await Session.updateOne({ _id: sessionId, userId }, { $set: { title } });
  return result.matchedCount > 0;
}

/** Deletes a session and its messages. Returns false if session doesn't belong to user. */
export async function deleteSession(userId: string, sessionId: string): Promise<boolean> {
  await connectDatabase();
  const mongoSession = await Session.startSession();
  try {
    let deleted = false;
    await mongoSession.withTransaction(async () => {
      const result = await Session.deleteOne({ _id: sessionId, userId }, { session: mongoSession });
      deleted = result.deletedCount > 0;
      if (deleted) await Message.deleteMany({ sessionId }, { session: mongoSession });
    });
    return deleted;
  } finally {
    await mongoSession.endSession();
  }
}

/** Creates an account with a locally hashed password. */
export async function createPasswordUser(username: string, passwordHash: string): Promise<string> {
  await connectDatabase();
  const [user] = await User.create([{ username, passwordHash }]);
  return user._id;
}

/** Returns a local account's password hash, or null when the username is unknown. */
export async function getPasswordUser(username: string): Promise<{ id: string; passwordHash: string | null } | null> {
  await connectDatabase();
  const user = await User.findOne({ username }).select({ username: 1, passwordHash: 1 }).lean();
  return user ? { id: user._id, passwordHash: user.passwordHash ?? null } : null;
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
  await connectDatabase();
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(provider)) throw new Error("Invalid OAuth provider");
  if (!providerSubject.trim() || providerSubject.length > 512) throw new Error("Invalid OAuth subject");
  const email = profile.email?.trim() || undefined;
  if (email && email.length > 320) throw new Error("Invalid OAuth email");
  const displayName = profile.displayName?.trim() || undefined;
  if (displayName && displayName.length > 200) throw new Error("Invalid OAuth display name");
  let avatarUrl: string | undefined;
  if (profile.avatarUrl) {
    const parsed = new URL(profile.avatarUrl);
    if (parsed.protocol !== "https:") throw new Error("Invalid OAuth avatar URL");
    avatarUrl = parsed.href;
  }
  const existing = await OAuthAccount.findOne({ provider, providerSubject }).lean();
  if (existing) {
    const emailProvided = profile.email !== undefined;
    await OAuthAccount.updateOne(
      { _id: existing._id },
      {
        $set: {
          ...(emailProvided ? { email: email ?? null, emailVerified: profile.emailVerified ?? false } : {}),
          ...(displayName ? { displayName } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
          profileUpdatedAt: new Date(),
        },
      },
    );
    const user = await User.findById(existing.userId).select({ username: 1 }).lean();
    if (!user) throw new Error("OAuth account has no user");
    return { id: user._id, username: user.username };
  }

  const base =
    (displayName ?? provider)
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .toLowerCase()
      .slice(0, 32) || "student";
  const mongoSession = await User.startSession();
  try {
    let created: { id: string; username: string } | undefined;
    await mongoSession.withTransaction(async () => {
      const duplicate = await OAuthAccount.findOne({ provider, providerSubject }).session(mongoSession).lean();
      if (duplicate) {
        const user = await User.findById(duplicate.userId).session(mongoSession).lean();
        if (!user) throw new Error("OAuth account has no user");
        created = { id: user._id, username: user.username };
        return;
      }
      let user: InstanceType<typeof User> | undefined;
      for (let attempt = 0; attempt < 5 && !user; attempt++) {
        const username = `${base}-${randomInt(1000, 10_000)}`;
        try {
          [user] = await User.create([{ username }], { session: mongoSession });
        } catch (error) {
          if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
        }
      }
      if (!user) throw new Error("Could not allocate a username for the OAuth account");
      await OAuthAccount.create(
        [
          {
            userId: user._id,
            provider,
            providerSubject,
            isPrimary: true,
            email: email ?? null,
            emailVerified: profile.emailVerified ?? false,
            displayName: displayName ?? null,
            avatarUrl: avatarUrl ?? null,
          },
        ],
        { session: mongoSession },
      );
      created = { id: user._id, username: user.username };
    });
    if (!created) throw new Error("Could not create OAuth account");
    return created;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      const winner = await OAuthAccount.findOne({ provider, providerSubject }).lean();
      if (winner) {
        const user = await User.findById(winner.userId).select({ username: 1 }).lean();
        if (user) return { id: user._id, username: user.username };
      }
    }
    throw error;
  } finally {
    await mongoSession.endSession();
  }
}
