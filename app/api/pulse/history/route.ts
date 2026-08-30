import { requireUser } from "@/src/server/auth";
import { getRoundHistory } from "@/src/server/pulse/store";
import { json, serverError } from "../../http";

/** GET /api/pulse/history — locked rounds newest first with final tallies.
 *  Tallies are always included: a locked round can no longer be anchored. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const rounds = await getRoundHistory(user.sub);
    return json({
      rounds: rounds.map(({ round, questions }) => ({
        id: round.id,
        title: round.title,
        published_at: round.publishedAt,
        questions: questions.map((q) => ({
          id: q.id,
          text: q.text,
          my_agree: q.myAgree,
          agree_count: q.agreeCount,
          disagree_count: q.disagreeCount,
        })),
      })),
    });
  } catch (e) {
    return serverError(e);
  }
}
