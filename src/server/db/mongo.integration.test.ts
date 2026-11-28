import { randomUUID } from "node:crypto";
import mongoose, { Schema } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listBuildingFavorites, setBuildingFavorite } from "../building-favorites";
import { closeDatabase } from "../db";
import { migrate } from "../db/migrate";
import {
  BuildingFavorite,
  DegreePlan,
  Message,
  OAuthAccount,
  PulseQuestion,
  PulseRound,
  PulseVote,
  Schedule,
  Session,
  User,
  UserProfile,
} from "../db/models";
import { validateMongoTestUri } from "../db/test-uri";
import { getPlan, savePlan } from "../plans";
import { getProfile, saveProfile } from "../profile";
import { castVote, getRoundHistory, publishRound } from "../pulse/store";
import { getSchedule, saveSchedule } from "../schedules";
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
const userDataIds: string[] = [];
const importedSessions: string[] = [];
const oauthSubjects: string[] = [];
const pulseRoundIds: number[] = [];
const pulseQuestionIds: number[] = [];
const pulseRunTitle = `integration-${randomUUID()}:`;
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
        const rounds = await PulseRound.find({ title: { $regex: `^${pulseRunTitle}` } })
          .select({ _id: 1 })
          .lean();
        const roundIds = [...new Set([...pulseRoundIds, ...rounds.map(({ _id }) => _id)])];
        const questions = await PulseQuestion.find({ roundId: { $in: roundIds } })
          .select({ _id: 1 })
          .lean();
        const questionIds = [...new Set([...pulseQuestionIds, ...questions.map(({ _id }) => _id)])];
        await Promise.all([
          Session.deleteMany({ _id: { $in: importedSessions } }),
          Message.deleteMany({ sessionId: { $in: importedSessions } }),
          OAuthAccount.deleteMany({ provider: "google", providerSubject: { $in: oauthSubjects } }),
          User.deleteMany({ _id: { $in: importedUsers } }),
          UserProfile.deleteMany({ _id: { $in: userDataIds } }),
          Schedule.deleteMany({ _id: { $in: userDataIds } }),
          DegreePlan.deleteMany({ _id: { $in: userDataIds } }),
          BuildingFavorite.deleteMany({ userId: { $in: userDataIds } }),
          PulseVote.deleteMany({ questionId: { $in: questionIds } }),
          PulseQuestion.deleteMany({ _id: { $in: questionIds } }),
          PulseRound.deleteMany({ _id: { $in: roundIds } }),
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

  it("persists per-user profile, schedule, plan, and favorite records", async () => {
    const userIds = [randomUUID(), randomUUID()];
    userDataIds.push(...userIds);
    const profiles = [
      { preferred_name: "Ada", program: "Computer Science" },
      { preferred_name: "Grace", program: "Mathematics" },
    ];
    const schedules = [{ entries: ["CPSC 110"] }, { entries: ["MATH 100"] }];
    const plans = [{ years: [{ id: "ada-year" }] }, { years: [{ id: "grace-year" }] }];

    await Promise.all([
      saveProfile(userIds[0], profiles[0]),
      saveProfile(userIds[1], profiles[1]),
      saveSchedule(userIds[0], schedules[0]),
      saveSchedule(userIds[1], schedules[1]),
      savePlan(userIds[0], plans[0]),
      savePlan(userIds[1], plans[1]),
    ]);
    await expect(getProfile(userIds[0])).resolves.toEqual(profiles[0]);
    await expect(getProfile(userIds[1])).resolves.toEqual(profiles[1]);
    await expect(getSchedule(userIds[0])).resolves.toEqual(schedules[0]);
    await expect(getSchedule(userIds[1])).resolves.toEqual(schedules[1]);
    await expect(getPlan(userIds[0])).resolves.toEqual(plans[0]);
    await expect(getPlan(userIds[1])).resolves.toEqual(plans[1]);

    await expect(setBuildingFavorite(userIds[0], "IKB", true)).resolves.toEqual(["IKB"]);
    await expect(setBuildingFavorite(userIds[0], "IKB", true)).resolves.toEqual(["IKB"]);
    await expect(listBuildingFavorites(userIds[1])).resolves.toEqual([]);
    await expect(setBuildingFavorite(userIds[0], "IKB", false)).resolves.toEqual([]);
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

  it("serializes concurrent first exchanges for the same session ID", async () => {
    const userId = randomUUID();
    const sessionId = randomUUID();
    importedUsers.push(userId);
    importedSessions.push(sessionId);
    await User.create({ _id: userId, username: `integration-race-${userId}` });

    await Promise.all([
      appendExchange(userId, sessionId, "Question one", "Answer one"),
      appendExchange(userId, sessionId, "Question two", "Answer two"),
    ]);

    const messages = await Message.find({ sessionId, userId }).sort({ order: 1 }).lean();
    expect(messages).toHaveLength(4);
    expect(messages.map(({ order }) => order)).toEqual([0, 1, 2, 3]);
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
    const first = await publishRound({ title: `${pulseRunTitle}initial`, questions: ["Statement"] });
    pulseRoundIds.push(first.roundId);
    const question = await PulseQuestion.findOne({ roundId: first.roundId }).lean();
    if (!question) throw new Error("Published Pulse question not found");
    pulseQuestionIds.push(question._id);
    await expect(castVote(userIds[0], question._id, true)).resolves.toMatchObject({ agree: true, agreeCount: 1 });

    const second = await publishRound({ title: `${pulseRunTitle}next`, questions: ["Another statement"] });
    pulseRoundIds.push(second.roundId);
    const before = await getRoundHistory(userIds[1]);
    expect(before[0]).toMatchObject({ round: { id: first.roundId }, questions: [{ id: question._id, agreeCount: 1 }] });
    await expect(castVote(userIds[1], question._id, false)).resolves.toBeNull();
    await expect(getRoundHistory(userIds[1])).resolves.toEqual(before);

    let activeRoundId = second.roundId;
    let activeQuestion = await PulseQuestion.findOne({ roundId: activeRoundId }).lean();
    if (!activeQuestion) throw new Error("Next Pulse question not found");
    pulseQuestionIds.push(activeQuestion._id);
    for (let attempt = 0; attempt < 5; attempt++) {
      const voterId = userIds[attempt % userIds.length];
      const otherUserId = userIds[(attempt + 1) % userIds.length];
      const [racingVote, racingPublish] = await Promise.all([
        castVote(voterId, activeQuestion._id, true),
        publishRound({ title: `${pulseRunTitle}race-${attempt}`, questions: [`Statement ${attempt}`] }),
      ]);
      pulseRoundIds.push(racingPublish.roundId);
      const lockedHistory = await getRoundHistory(otherUserId);
      const racedRound = lockedHistory.find(({ round }) => round.id === activeRoundId);
      expect(racedRound?.questions[0].agreeCount).toBe(racingVote ? 1 : 0);
      await expect(castVote(otherUserId, activeQuestion._id, false)).resolves.toBeNull();
      await expect(getRoundHistory(otherUserId)).resolves.toEqual(lockedHistory);

      const nextQuestion = await PulseQuestion.findOne({ roundId: racingPublish.roundId }).lean();
      if (!nextQuestion) throw new Error("Published Pulse question not found");
      activeRoundId = racingPublish.roundId;
      activeQuestion = nextQuestion;
      pulseQuestionIds.push(nextQuestion._id);
    }
  });
});
