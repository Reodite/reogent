import { randomInt } from "node:crypto";
import { connectDatabase } from "../db";
import { SharerGroup, SharerGroupMember, SharerPerson as SharerPersonModel, User } from "../db/models";

const CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CODE_LENGTH = 6;
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
  await connectDatabase();
  const saved = await SharerPersonModel.findById(userId).lean();
  return saved ? (saved.person as SharerPerson) : null;
}

/** Upserts the caller's person record. The server owns id/updatedAt. */
export async function savePerson(userId: string, body: { handle: string; avatar: unknown; schedule: unknown }) {
  await connectDatabase();
  const person: SharerPerson = {
    id: userId,
    handle: body.handle,
    avatar: body.avatar,
    schedule: body.schedule,
    updatedAt: new Date().toISOString(),
  };
  await SharerPersonModel.findOneAndUpdate(
    { _id: userId },
    { $set: { person, updatedAt: new Date(person.updatedAt) } },
    { upsert: true, runValidators: true },
  );
  return person;
}

/** Creates a group owned and auto-joined by the caller, retrying code collisions. */
export async function createGroup(ownerId: string, name: string): Promise<GroupDetail | null> {
  await connectDatabase();
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = drawCode();
    const session = await SharerGroup.startSession();
    try {
      await session.withTransaction(async () => {
        await SharerGroup.create([{ _id: code, name, createdBy: ownerId }], { ordered: true, session });
        await SharerGroupMember.create([{ groupCode: code, userId: ownerId }], { ordered: true, session });
      });
      return (await getGroup(code)) ?? null;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) continue;
      throw error;
    } finally {
      await session.endSession();
    }
  }
  return null;
}

/** Validates code shape before it hits the DB, keeping queries cheap. */
export const CODE_PATTERN = /^[0-9A-Za-z]{6}$/;

/** Groups the caller belongs to, newest first. */
export async function listGroups(userId: string): Promise<GroupSummary[]> {
  await connectDatabase();
  const memberships = await SharerGroupMember.find({ userId }).sort({ joinedAt: -1 }).lean();
  const codes = memberships.map(({ groupCode }) => groupCode);
  const groups = await SharerGroup.find({ _id: { $in: codes } })
    .sort({ createdAt: -1 })
    .lean();
  const counts = (await SharerGroupMember.aggregate([
    { $match: { groupCode: { $in: codes } } },
    { $group: { _id: "$groupCode", count: { $sum: 1 } } },
  ])) as { _id: string; count: number }[];
  const countByCode = new Map(counts.map(({ _id, count }) => [_id, count]));
  return groups.map((group) => ({
    code: group._id,
    name: group.name,
    memberCount: countByCode.get(group._id) ?? 0,
    updatedAt: group.createdAt.toISOString(),
  }));
}

/**
 * Returns group members, including people who joined but never uploaded a schedule.
 */
export async function getGroup(code: string): Promise<GroupDetail | null> {
  await connectDatabase();
  const group = await SharerGroup.findById(code).lean();
  if (!group) return null;
  const members = await SharerGroupMember.find({ groupCode: code }).sort({ joinedAt: 1 }).lean();
  const userIds = members.map(({ userId }) => userId);
  const [users, people] = await Promise.all([
    User.find({ _id: { $in: userIds } })
      .select({ username: 1 })
      .lean(),
    SharerPersonModel.find({ _id: { $in: userIds } }).lean(),
  ]);
  const usernames = new Map(users.map(({ _id, username }) => [_id, username]));
  const personByUser = new Map(people.map(({ _id, person }) => [_id, person as SharerPerson]));
  return {
    code: group._id,
    name: group.name,
    createdBy: group.createdBy,
    createdAt: group.createdAt.toISOString(),
    members: members.map(
      ({ userId, joinedAt }) =>
        personByUser.get(userId) ?? {
          id: userId,
          handle: usernames.get(userId) ?? userId,
          avatar: null,
          schedule: null,
          updatedAt: joinedAt.toISOString(),
        },
    ),
  };
}

/** Returns group detail only when the caller is already a member. */
export async function getGroupForMember(userId: string, code: string): Promise<GroupDetail | null> {
  await connectDatabase();
  const member = await SharerGroupMember.exists({ groupCode: code, userId });
  return member ? getGroup(code) : null;
}

/** Adds the caller to a group. Null when unknown; rejoining is a no-op. */
export async function joinGroup(userId: string, code: string): Promise<GroupDetail | null> {
  await connectDatabase();
  const session = await SharerGroup.startSession();
  let exists = false;
  try {
    await session.withTransaction(async () => {
      exists = (await SharerGroup.exists({ _id: code }).session(session).lean()) !== null;
      if (!exists) return;
      await SharerGroupMember.create([{ groupCode: code, userId }], { ordered: true, session });
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      exists = (await SharerGroup.exists({ _id: code })) !== null;
    } else {
      throw error;
    }
  } finally {
    await session.endSession();
  }
  return exists ? getGroup(code) : null;
}

/** Removes the caller from a group. False when they were not a member. */
export async function leaveGroup(userId: string, code: string): Promise<boolean> {
  await connectDatabase();
  const result = await SharerGroupMember.deleteOne({ groupCode: code, userId });
  return result.deletedCount === 1;
}
