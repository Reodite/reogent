import { randomUUID } from "node:crypto";
import mongoose, { Schema } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../db";
import { migrate } from "../db/migrate";
import { Message, OAuthAccount, PulseQuestion, PulseRound, PulseVote, Session, User } from "../db/models";
import { validateMongoTestUri } from "../db/test-uri";
import { castVote, getRoundHistory, publishRound } from "../pulse/store";
import { appendExchange, findOrCreateOAuthUser, getSessionMessages, listSessions } from "../sessions/store";

const uri = process.env.MONGODB_TEST_URI;
if (uri) validateMongoTestUri(uri);
if (!uri && process.env.REQUIRE_MONGODB_TESTS === "true") {
  throw new Error("MONGODB_TEST_URI is required for MongoDB integration tests");
}
const collectionName = `reodite_integration_${process.pid}_${Date.now()}`;
const recordSchema = new Schema({ value: { type: Number, required: true } }, { collection: collectionName });
const Record = mongoose.model(`ReoditeIntegration_${process.pid}_${Date.now()}`, recordSchema);
const importedUsers: string[] = [];
const importedSessions: string[] = [];
const oauthSubjects: string[] = [];
const pulseRoundIds: number[] = [];
const pulseQuestionIds: number[] = [];
const originalExternalToggle = process.env.USE_EXTERNAL_MONGODB;
const originalMongoUri = process.env.MONGODB_URI;

describe.skipIf(!uri)("MongoDB replica-set integration", () => {
  beforeAll(async () => {
    process.env.USE_EXTERNAL_MONGODB = "true";
    process.env.MONGODB_URI = uri;
    await migrate();
  });

  afterAll(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await Record.collection.drop().catch(() => {});
        await Promise.all([
          Session.deleteMany({ _id: { $in: importedSessions } }),
          Message.deleteMany({ sessionId: { $in: importedSessions } }),
          OAuthAccount.deleteMany({ providerSubject: { $in: oauthSubjects } }),
          User.deleteMany({ _id: { $in: importedUsers } }),
          PulseVote.deleteMany({ questionId: { $in: pulseQuestionIds } }),
          PulseQuestion.deleteMany({ _id: { $in: pulseQuestionIds } }),
          PulseRound.deleteMany({ _id: { $in: pulseRoundIds } }),
        ]);
      }
    } finally {
      await closeDatabase().catch(() => {});
      if (originalExternalToggle === undefined) delete process.env.USE_EXTERNAL_MONGODB;
      else process.env.USE_EXTERNAL_MONGODB = originalExternalToggle;
      if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = originalMongoUri;
    }
  });

  it("commits and aborts multi-document transactions", async () => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Record.create([{ value: 1 }, { value: 2 }], { ordered: true, session });
      });
      expect((await Record.find().sort({ value: 1 }).lean()).map(({ value }) => value)).toEqual([1, 2]);

      await expect(
        session.withTransaction(async () => {
          await Record.create([{ value: 3 }], { ordered: true, session });
          throw new Error("abort transaction");
        }),
      ).rejects.toThrow("abort transaction");
      await expect(Record.countDocuments()).resolves.toBe(2);
    } finally {
      await session.endSession();
    }
  });

  it("enforces unique indexes on the connected Mongo server", async () => {
    await Record.collection.createIndex({ value: 1 }, { unique: true });
    await Record.create({ value: 4 });
    await expect(Record.create({ value: 4 })).rejects.toMatchObject({ code: 11000 });
  });

  it("connects direct session-store calls and atomically writes owned exchanges", async () => {
    const userId = randomUUID();
    const sessionId = randomUUID();
    importedUsers.push(userId);
    importedSessions.push(sessionId);
    await User.create({ _id: userId, username: `integration-${userId}` });
    await expect(listSessions(userId)).resolves.toEqual([]);
    await appendExchange(userId, sessionId, "Question", "Answer");
    await expect(getSessionMessages(userId, sessionId)).resolves.toEqual([
      { role: "user", content: "Question", citations: null },
      { role: "assistant", content: "Answer", citations: null },
    ]);
    const messageDocs = await Message.find({ sessionId, userId }).lean();
    expect(messageDocs).toHaveLength(2);
    expect(messageDocs.every((message) => message.userId === userId)).toBe(true);
    await expect(getSessionMessages(randomUUID(), sessionId)).resolves.toBeNull();
  });

  it("handles concurrent first OAuth sign-ins as one identity", async () => {
    const providerSubject = `integration-${randomUUID()}`;
    oauthSubjects.push(providerSubject);
    const [first, second] = await Promise.all([
      findOrCreateOAuthUser("google", providerSubject, { displayName: "Integration User" }),
      findOrCreateOAuthUser("google", providerSubject, { displayName: "Integration User" }),
    ]);
    importedUsers.push(first.id);
    expect(second).toEqual(first);
    await expect(OAuthAccount.countDocuments({ provider: "google", providerSubject })).resolves.toBe(1);
  });

  it("freezes historical Pulse tallies after a round locks", async () => {
    const userIds = [randomUUID(), randomUUID()];
    importedUsers.push(...userIds);
    await User.create(
      userIds.map((id) => ({ _id: id, username: `pulse-integration-${id}` })),
      { ordered: true },
    );
    const first = await publishRound({ title: "Integration round", questions: ["Statement"] });
    pulseRoundIds.push(first.roundId);
    const question = await PulseQuestion.findOne({ roundId: first.roundId }).lean();
    if (!question) throw new Error("Published Pulse question not found");
    pulseQuestionIds.push(question._id);
    await expect(castVote(userIds[0], question._id, true)).resolves.toMatchObject({ agree: true, agreeCount: 1 });

    const second = await publishRound({ title: "Next round", questions: ["Another statement"] });
    pulseRoundIds.push(second.roundId);
    const before = await getRoundHistory(userIds[1]);
    expect(before[0]).toMatchObject({ round: { id: first.roundId }, questions: [{ id: question._id, agreeCount: 1 }] });
    await expect(castVote(userIds[1], question._id, false)).resolves.toBeNull();
    await expect(getRoundHistory(userIds[1])).resolves.toEqual(before);

    const nextQuestion = await PulseQuestion.findOne({ roundId: second.roundId }).lean();
    if (!nextQuestion) throw new Error("Next Pulse question not found");
    pulseQuestionIds.push(nextQuestion._id);
    const [racingVote, racingPublish] = await Promise.all([
      castVote(userIds[1], nextQuestion._id, true),
      publishRound({ title: "Race winner", questions: ["Final statement"] }),
    ]);
    pulseRoundIds.push(racingPublish.roundId);
    const finalQuestion = await PulseQuestion.findOne({ roundId: racingPublish.roundId }).lean();
    if (finalQuestion) pulseQuestionIds.push(finalQuestion._id);
    const historyAfterRace = await getRoundHistory(userIds[0]);
    const racedRound = historyAfterRace.find(({ round }) => round.id === second.roundId);
    expect(racedRound?.questions[0].agreeCount).toBe(racingVote ? 1 : 0);
    await expect(castVote(userIds[0], nextQuestion._id, false)).resolves.toBeNull();
    await expect(getRoundHistory(userIds[0])).resolves.toEqual(historyAfterRace);
  });
});
