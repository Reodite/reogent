import type { ClientSession } from "mongoose";
import { connectDatabase } from "../db";
import { Counter, PulseQuestion, PulseRound as PulseRoundModel, PulseVote } from "../db/models";

/** Metadata for the round currently accepting votes. */
export interface PulseRound {
  id: number;
  title: string | null;
  publishedAt: string;
}

/** A feed question with the caller's stored vote and the current tallies. */
export interface PulseFeedQuestion {
  id: number;
  text: string;
  /** Null until the caller votes. */
  myAgree: boolean | null;
  agreeCount: number;
  disagreeCount: number;
}

/** Result of a vote: the stored direction (first write wins) and fresh tallies. */
export interface PulseVoteTally {
  agree: boolean;
  agreeCount: number;
  disagreeCount: number;
}

async function questionsForRounds(
  roundIds: number[],
  userId: string,
  session?: ClientSession,
): Promise<Map<number, PulseFeedQuestion[]>> {
  if (roundIds.length === 0) return new Map();
  const questions = await PulseQuestion.find({ roundId: { $in: roundIds } })
    .sort({ roundId: 1, position: 1 })
    .session(session ?? null)
    .lean();
  const questionIds = questions.map(({ _id }) => _id);
  const [votes, callerVotes] = await Promise.all([
    PulseVote.aggregate([
      { $match: { questionId: { $in: questionIds } } },
      { $group: { _id: { questionId: "$questionId", agree: "$agree" }, count: { $sum: 1 } } },
    ]).session(session ?? null),
    PulseVote.find({ questionId: { $in: questionIds }, userId })
      .session(session ?? null)
      .lean(),
  ]);
  const myVotes = new Map(callerVotes.map((vote) => [vote.questionId, vote.agree]));
  const tallies = new Map<number, { agree: number; disagree: number }>();
  for (const vote of votes as { _id: { questionId: number; agree: boolean }; count: number }[]) {
    const tally = tallies.get(vote._id.questionId) ?? { agree: 0, disagree: 0 };
    tally[vote._id.agree ? "agree" : "disagree"] = vote.count;
    tallies.set(vote._id.questionId, tally);
  }
  const results = new Map(roundIds.map((roundId) => [roundId, [] as PulseFeedQuestion[]]));
  for (const question of questions) {
    const tally = tallies.get(question._id) ?? { agree: 0, disagree: 0 };
    results.get(question.roundId)?.push({
      id: question._id,
      text: question.text,
      myAgree: myVotes.get(question._id) ?? null,
      agreeCount: tally.agree,
      disagreeCount: tally.disagree,
    });
  }
  return results;
}

function toRound(round: { _id: number; title?: string | null; publishedAt: Date }): PulseRound {
  return { id: round._id, title: round.title ?? null, publishedAt: round.publishedAt.toISOString() };
}

/** The active round's questions in seed order, with the caller's votes and tallies. */
export async function getActiveFeed(
  userId: string,
): Promise<{ round: PulseRound | null; questions: PulseFeedQuestion[] }> {
  await connectDatabase();
  const round = await PulseRoundModel.findOne({ status: "active" }).lean();
  if (!round) return { round: null, questions: [] };
  const questions = await questionsForRounds([round._id], userId);
  return { round: toRound(round), questions: questions.get(round._id) ?? [] };
}

/**
 * Locked rounds newest first (at most `limit`), each with its questions in
 * seed order, final tallies, and the caller's vote.
 */
export async function getRoundHistory(
  userId: string,
  limit = 10,
): Promise<{ round: PulseRound; questions: PulseFeedQuestion[] }[]> {
  await connectDatabase();
  const session = await PulseRoundModel.startSession();
  try {
    let history: { round: PulseRound; questions: PulseFeedQuestion[] }[] = [];
    await session.withTransaction(
      async () => {
        const rounds = await PulseRoundModel.find({ status: "locked" })
          .sort({ publishedAt: -1 })
          .limit(limit)
          .session(session)
          .lean();
        const questions = await questionsForRounds(
          rounds.map(({ _id }) => _id),
          userId,
          session,
        );
        history = rounds.map((round) => ({ round: toRound(round), questions: questions.get(round._id) ?? [] }));
      },
      { readConcern: { level: "snapshot" } },
    );
    return history;
  } finally {
    await session.endSession();
  }
}

/**
 * Records a vote. First write wins and the active-round check and vote insert
 * share a transaction. Returns null for unknown questions or locked rounds.
 */
export async function castVote(userId: string, questionId: number, agree: boolean): Promise<PulseVoteTally | null> {
  await connectDatabase();
  const session = await PulseVote.startSession();
  try {
    try {
      await session.withTransaction(async () => {
        const question = await PulseQuestion.findById(questionId).session(session).lean();
        if (!question) return;
        const round = await PulseRoundModel.findById(question.roundId).session(session).lean();
        if (round?.status !== "active") return;
        const active = await PulseRoundModel.updateOne(
          { _id: question.roundId, status: "active" },
          { $inc: { voteRevision: 1 } },
          { session },
        );
        if (!active.matchedCount) return;
        await PulseVote.create([{ questionId, userId, agree }], { session });
      });
    } catch (error) {
      if (!isPulseVoteDuplicate(error, questionId, userId)) throw error;
    }
    const existing = await PulseVote.findOne({ questionId, userId }).lean();
    const storedAgree = existing?.agree ?? null;
    if (storedAgree === null) return null;
    const tally = (await PulseVote.aggregate([
      { $match: { questionId } },
      { $group: { _id: "$agree", count: { $sum: 1 } } },
    ])) as { _id: boolean; count: number }[];
    return {
      agree: storedAgree,
      agreeCount: tally.find(({ _id }) => _id)?.count ?? 0,
      disagreeCount: tally.find(({ _id }) => !_id)?.count ?? 0,
    };
  } finally {
    await session.endSession();
  }
}

function isPulseVoteDuplicate(error: unknown, questionId: number, userId: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== 11000) return false;
  const keyValue = (error as { keyValue?: Record<string, unknown> }).keyValue;
  return keyValue?.questionId === questionId && keyValue.userId === userId;
}

/** Locks the active round and publishes the next round with its questions atomically. */
export async function publishRound(input: {
  title: string | null;
  questions: string[];
}): Promise<{ lockedRoundId: number | null; roundId: number }> {
  await connectDatabase();
  const session = await PulseRoundModel.startSession();
  try {
    let result: { lockedRoundId: number | null; roundId: number } | undefined;
    await session.withTransaction(async () => {
      const active = await PulseRoundModel.findOneAndUpdate(
        { status: "active" },
        { $set: { status: "locked", lockedAt: new Date() } },
        { returnDocument: "after", session },
      ).lean();
      const counter = await Counter.findOneAndUpdate(
        { _id: "pulse-round" },
        [{ $set: { value: { $add: [{ $ifNull: ["$value", 0] }, 1] } } }],
        { upsert: true, returnDocument: "after", updatePipeline: true, session },
      ).lean();
      const roundId = counter?.value;
      if (!roundId) throw new Error("Could not allocate a Pulse round ID");
      await PulseRoundModel.create([{ _id: roundId, title: input.title, status: "active" }], { session });
      if (input.questions.length) {
        const questionCounter = await Counter.findOneAndUpdate(
          { _id: "pulse-question" },
          [
            {
              $set: {
                value: { $add: [{ $ifNull: ["$value", 0] }, input.questions.length] },
              },
            },
          ],
          { upsert: true, returnDocument: "after", updatePipeline: true, session },
        ).lean();
        if (!questionCounter) throw new Error("Could not allocate Pulse question IDs");
        const firstQuestionId = questionCounter.value - input.questions.length + 1;
        await PulseQuestion.insertMany(
          input.questions.map((text, position) => ({ _id: firstQuestionId + position, roundId, position, text })),
          { session },
        );
      }
      result = { lockedRoundId: active?._id ?? null, roundId };
    });
    if (!result) throw new Error("Could not publish pulse round");
    return result;
  } finally {
    await session.endSession();
  }
}
