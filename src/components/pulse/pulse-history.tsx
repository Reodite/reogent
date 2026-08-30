"use client";

import { useApi } from "@/src/components/providers";
import type { PulseHistory as PulseHistoryData } from "@/src/lib/api-types";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { ShadowCard } from "./question-card";

/** Read-only list of locked rounds with their final tallies, under the active feed. */
export function PulseHistory() {
  const api = useApi();
  const reduce = useReducedMotion();
  const [rounds, setRounds] = useState<PulseHistoryData["rounds"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setError(null);
    try {
      setRounds((await api.getPulseHistory()).rounds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load previous rounds");
    }
  }, [api]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  if (!rounds && !error) return null;

  return (
    <section aria-labelledby="pulse-history-heading" className="mt-6 flex flex-col gap-3">
      <h2 id="pulse-history-heading" className="text-on-surface text-base font-medium tracking-[-0.01em]">
        Previous rounds
      </h2>
      {error && (
        <div className="flex flex-col items-center gap-3 py-4">
          <p className="text-on-surface-variant text-sm">{error}</p>
          <button
            type="button"
            onClick={() => void fetchHistory()}
            className="neu-button bg-surface text-on-surface min-h-11 rounded-xl px-4 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      )}
      {rounds?.length === 0 && <p className="text-muted py-4 text-center text-sm">No previous rounds yet.</p>}
      {rounds?.map((round) => (
        <div key={round.id} className="flex flex-col gap-3">
          <h3 className="text-muted text-xs font-medium tracking-[0.05em] uppercase">
            {round.title ??
              new Date(round.published_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
          </h3>
          {round.questions.map((q) => (
            <ShadowCard
              key={q.id}
              reduce={!!reduce}
              card={{
                id: q.id,
                text: q.text,
                myAgree: q.my_agree ?? undefined,
                agreeCount: q.agree_count,
                disagreeCount: q.disagree_count,
              }}
            />
          ))}
        </div>
      ))}
    </section>
  );
}
