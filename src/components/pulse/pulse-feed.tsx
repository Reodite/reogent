"use client";

import { useApi } from "@/src/components/providers";
import { announce } from "@/src/components/ui/live-region";
import { ApiError } from "@/src/lib/api-types";
import { useCallback, useEffect, useState } from "react";
import { PulseHistory } from "./pulse-history";
import { PulseQuestionCard, type PulseCardData } from "./question-card";

interface FeedData {
  round: { id: number; title: string | null } | null;
  questions: PulseCardData[];
}

/**
 * The Pulse page body: fetches the active round and orchestrates votes.
 * A vote flips the card to a pending shadow immediately, then reconciles with
 * the stored vote and tallies from the server; a failure reverts the card.
 */
export function PulseFeed() {
  const api = useApi();
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setError(null);
    setFeed(null);
    try {
      const data = await api.getPulseFeed();
      setFeed({
        round: data.round ? { id: data.round.id, title: data.round.title } : null,
        questions: data.questions.map((q) => ({
          id: q.id,
          text: q.text,
          myAgree: q.my_agree,
          agreeCount: q.agree_count,
          disagreeCount: q.disagree_count,
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load questions");
    }
  }, [api]);

  useEffect(() => {
    void fetchFeed();
  }, [fetchFeed]);

  const patchQuestion = useCallback((questionId: number, patch: Partial<PulseCardData>) => {
    setFeed(
      (cur) =>
        cur && {
          ...cur,
          questions: cur.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q)),
        },
    );
  }, []);

  const handleVote = useCallback(
    async (questionId: number, agree: boolean) => {
      patchQuestion(questionId, { myAgree: agree, pending: true, error: undefined });
      try {
        const result = await api.votePulse(questionId, agree);
        patchQuestion(questionId, {
          myAgree: result.agree,
          agreeCount: result.agree_count,
          disagreeCount: result.disagree_count,
          pending: false,
        });
        const total = result.agree_count + result.disagree_count;
        const pct = total > 0 ? Math.round((100 * result.agree_count) / total) : 0;
        announce(`Vote recorded. ${pct} percent agree.`);
      } catch (e) {
        const message =
          e instanceof ApiError && e.status === 409 ? "Voting has closed for this question" : "Vote failed. Try again.";
        patchQuestion(questionId, { myAgree: undefined, pending: false, error: message });
        announce(message);
      }
    },
    [api, patchQuestion],
  );

  const loading = !feed && !error;
  const empty = feed && (!feed.round || feed.questions.length === 0);

  return (
    <section aria-label="Pulse" className="flex min-h-0 w-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-baseline gap-3 bg-transparent px-4 py-3">
        <h1 className="text-on-surface min-w-0 truncate text-base font-medium tracking-[-0.01em]">Pulse</h1>
        {feed?.round?.title && <span className="text-muted min-w-0 truncate text-sm">{feed.round.title}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
          {/* Same box as the empty state, so a round with no questions is a
              text swap instead of three ghost cards appearing and vanishing. */}
          {loading && <p className="text-muted py-8 text-center text-sm">Loading questions…</p>}
          {error && (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-on-surface-variant text-sm">{error}</p>
              <button
                type="button"
                onClick={() => void fetchFeed()}
                className="neu-button bg-surface text-on-surface min-h-11 rounded-xl px-4 text-sm font-medium"
              >
                Try again
              </button>
            </div>
          )}
          {empty && <p className="text-muted py-8 text-center text-sm">No active round right now. Check back soon.</p>}
          {feed && !empty && (
            <>
              <p className="text-muted text-sm">Swipe right to agree, left to disagree. Results show once you vote.</p>
              {feed.questions.map((q) => (
                <PulseQuestionCard key={q.id} card={q} onVote={(agree) => void handleVote(q.id, agree)} />
              ))}
            </>
          )}
          <PulseHistory />
        </div>
      </div>
    </section>
  );
}
