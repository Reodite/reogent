import { getPool } from "../db";

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

/** The active round's questions in seed order, with the caller's votes and tallies. */
export async function getActiveFeed(
  userId: string,
): Promise<{ round: PulseRound | null; questions: PulseFeedQuestion[] }> {
  const roundResult = await getPool().query(`SELECT id, title, published_at FROM pulse_rounds WHERE status = 'active'`);
  if (roundResult.rows.length === 0) return { round: null, questions: [] };
  const round = roundResult.rows[0];

  const { rows } = await getPool().query(
    `SELECT q.id, q.text,
            v.agree AS my_agree,
            COUNT(av.*) FILTER (WHERE av.agree)::int AS agree_count,
            COUNT(av.*) FILTER (WHERE NOT av.agree)::int AS disagree_count
     FROM pulse_questions q
     LEFT JOIN pulse_votes v ON v.question_id = q.id AND v.user_id = $2
     LEFT JOIN pulse_votes av ON av.question_id = q.id
     WHERE q.round_id = $1
     GROUP BY q.id, q.text, q.position, v.agree
     ORDER BY q.position`,
    [round.id, userId],
  );
  return {
    round: { id: round.id, title: round.title, publishedAt: round.published_at.toISOString() },
    questions: rows.map(toQuestion),
  };
}

// biome-ignore lint/suspicious/noExplicitAny: raw pg row
function toQuestion(r: any): PulseFeedQuestion {
  return {
    id: r.id,
    text: r.text,
    myAgree: r.my_agree ?? null,
    agreeCount: r.agree_count,
    disagreeCount: r.disagree_count,
  };
}

/**
 * Locked rounds newest first (at most `limit`), each with its questions in
 * seed order, final tallies, and the caller's vote. Tallies are frozen once a
 * round locks, so nothing here changes after publish.
 */
export async function getRoundHistory(
  userId: string,
  limit = 10,
): Promise<{ round: PulseRound; questions: PulseFeedQuestion[] }[]> {
  const pool = getPool();
  const roundResult = await pool.query(
    `SELECT id, title, published_at FROM pulse_rounds WHERE status = 'locked' ORDER BY published_at DESC LIMIT $1`,
    [limit],
  );
  if (roundResult.rows.length === 0) return [];

  const { rows } = await pool.query(
    `SELECT q.round_id, q.id, q.text,
            v.agree AS my_agree,
            COUNT(av.*) FILTER (WHERE av.agree)::int AS agree_count,
            COUNT(av.*) FILTER (WHERE NOT av.agree)::int AS disagree_count
     FROM pulse_questions q
     LEFT JOIN pulse_votes v ON v.question_id = q.id AND v.user_id = $2
     LEFT JOIN pulse_votes av ON av.question_id = q.id
     WHERE q.round_id = ANY($1::int[])
     GROUP BY q.round_id, q.id, q.text, q.position, v.agree
     ORDER BY q.position`,
    [roundResult.rows.map((r) => r.id), userId],
  );
  return roundResult.rows.map((round) => ({
    round: { id: round.id, title: round.title, publishedAt: round.published_at.toISOString() },
    questions: rows.filter((r) => r.round_id === round.id).map(toQuestion),
  }));
}

/**
 * Records a vote. First write wins: a repeat vote keeps the stored direction.
 * Returns the stored vote with fresh tallies, or null when the question is
 * unknown or its round is locked. The round check lives inside the INSERT so a
 * concurrent publish cannot slip a vote into a just-locked round.
 */
export async function castVote(userId: string, questionId: number, agree: boolean): Promise<PulseVoteTally | null> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO pulse_votes (question_id, user_id, agree)
     SELECT q.id, $2, $3
     FROM pulse_questions q
     JOIN pulse_rounds r ON r.id = q.round_id
     WHERE q.id = $1 AND r.status = 'active'
     ON CONFLICT (question_id, user_id) DO NOTHING`,
    [questionId, userId, agree],
  );
  const { rows } = await pool.query(
    `SELECT (SELECT agree FROM pulse_votes WHERE question_id = $1 AND user_id = $2) AS my_agree,
            COUNT(*) FILTER (WHERE agree)::int AS agree_count,
            COUNT(*) FILTER (WHERE NOT agree)::int AS disagree_count
     FROM pulse_votes WHERE question_id = $1`,
    [questionId, userId],
  );
  const row = rows[0];
  if (row.my_agree == null) return null;
  return { agree: row.my_agree, agreeCount: row.agree_count, disagreeCount: row.disagree_count };
}

/**
 * Locks the active round (freezing its tallies) and publishes a new round with
 * `questions` in seed order, as one transaction. A failure rolls back both, so
 * the previous round stays active.
 */
export async function publishRound(input: {
  title: string | null;
  questions: string[];
}): Promise<{ lockedRoundId: number | null; roundId: number }> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `UPDATE pulse_rounds SET status = 'locked', locked_at = now() WHERE status = 'active' RETURNING id`,
    );
    const round = await client.query(`INSERT INTO pulse_rounds (title) VALUES ($1) RETURNING id`, [input.title]);
    const roundId = round.rows[0].id;
    for (let i = 0; i < input.questions.length; i++) {
      await client.query(`INSERT INTO pulse_questions (round_id, position, text) VALUES ($1, $2, $3)`, [
        roundId,
        i,
        input.questions[i],
      ]);
    }
    await client.query("COMMIT");
    return { lockedRoundId: locked.rows[0]?.id ?? null, roundId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
