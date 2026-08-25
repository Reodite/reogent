import { requireUser } from "@/src/server/auth";
import { getActiveFeed } from "@/src/server/pulse/store";
import { json, serverError } from "../http";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const feed = await getActiveFeed(user.sub);
    return json({
      round: feed.round ? { id: feed.round.id, title: feed.round.title, published_at: feed.round.publishedAt } : null,
      // Tallies are withheld until the caller votes so results can't anchor the vote.
      questions: feed.questions.map((q) =>
        q.myAgree === null
          ? { id: q.id, text: q.text }
          : { id: q.id, text: q.text, my_agree: q.myAgree, agree_count: q.agreeCount, disagree_count: q.disagreeCount },
      ),
    });
  } catch (e) {
    return serverError(e);
  }
}
