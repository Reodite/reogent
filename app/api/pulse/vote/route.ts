import { requireUser } from "@/src/server/auth";
import { castVote } from "@/src/server/pulse/store";
import { rateLimitResponse } from "@/src/server/rate-limit";
import { json, requireJson, serverError } from "../../http";

// Generous enough to swipe through a full round quickly; blocks scripted tally-stuffing.
const VOTE_LIMIT = { windowMs: 60_000, maxRequests: 60 };

export async function POST(request: Request): Promise<Response> {
  try {
    const ctError = requireJson(request);
    if (ctError) return ctError;

    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const limited = rateLimitResponse(`pulse-vote:${user.sub}`, VOTE_LIMIT);
    if (limited) return limited;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Request body must be valid JSON" }, 400);
    }
    const { question_id: questionId, agree } = (body ?? {}) as { question_id?: unknown; agree?: unknown };
    if (!Number.isInteger(questionId) || typeof agree !== "boolean") {
      return json({ error: "Body must include an integer question_id and a boolean agree" }, 400);
    }

    const result = await castVote(user.sub, questionId as number, agree);
    if (!result) return json({ error: "Voting is closed for this question" }, 409);
    // `agree` echoes the stored vote, which corrects a duplicate submission client-side.
    return json({
      question_id: questionId,
      agree: result.agree,
      agree_count: result.agreeCount,
      disagree_count: result.disagreeCount,
    });
  } catch (e) {
    return serverError(e);
  }
}
