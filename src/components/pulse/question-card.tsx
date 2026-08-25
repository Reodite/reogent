"use client";

import { Icon } from "@/src/components/icons";
import { motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { PanInfo } from "motion/react";

/** Client-side card state. Vote fields appear after voting; `pending` while the request is in flight. */
export interface PulseCardData {
  id: number;
  text: string;
  myAgree?: boolean;
  agreeCount?: number;
  disagreeCount?: number;
  pending?: boolean;
  error?: string;
}

const COMMIT_OFFSET = 100;
const COMMIT_VELOCITY = 500;

/** Maps a horizontal drag release to a vote: true = agree (right), false = disagree (left), null = snap back. */
export function voteFromDrag(offsetX: number, velocityX: number): boolean | null {
  if (Math.abs(offsetX) > COMMIT_OFFSET) return offsetX > 0;
  if (Math.abs(velocityX) > COMMIT_VELOCITY) return velocityX > 0;
  return null;
}

/**
 * One question card. Unvoted: draggable left/right (buttons remain the
 * keyboard, screen-reader, and reduced-motion path). Voted: a dimmed shadow of
 * the same card with the tallies on each side.
 */
export function PulseQuestionCard({ card, onVote }: { card: PulseCardData; onVote: (agree: boolean) => void }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-6, 6]);
  const agreeHint = useTransform(x, [40, 140], [0, 1]);
  const disagreeHint = useTransform(x, [-140, -40], [1, 0]);

  if (card.myAgree !== undefined) return <ShadowCard card={card} reduce={!!reduce} />;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const vote = voteFromDrag(info.offset.x, info.velocity.x);
    if (vote !== null) onVote(vote);
  };

  return (
    <motion.article
      drag={reduce ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      style={reduce ? undefined : { x, rotate }}
      whileHover={reduce ? undefined : { y: -3, scale: 1.01 }}
      whileDrag={reduce ? undefined : { scale: 1.03 }}
      onDragEnd={handleDragEnd}
      className={`bg-surface relative touch-pan-y rounded-2xl p-4 shadow-[6px_6px_18px_var(--neu-shadow),-4px_-4px_12px_var(--neu-highlight)] select-none ${
        reduce ? "" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      {!reduce && (
        <>
          <span aria-hidden="true" className="bg-outline/40 mx-auto mb-3 block h-1.5 w-10 rounded-full" />
          <motion.span
            style={{ opacity: disagreeHint }}
            aria-hidden="true"
            className="border-primary text-primary absolute top-3 left-3 rounded-full border px-3 py-1 text-xs font-medium"
          >
            Disagree
          </motion.span>
          <motion.span
            style={{ opacity: agreeHint }}
            aria-hidden="true"
            className="border-primary text-primary absolute top-3 right-3 rounded-full border px-3 py-1 text-xs font-medium"
          >
            Agree
          </motion.span>
        </>
      )}
      <p className="text-on-surface text-base">{card.text}</p>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onVote(false)}
          aria-label={`Disagree: ${card.text}`}
          className="text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:ring-primary/40 flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <Icon name="left" size={16} />
          Disagree
        </button>
        <button
          type="button"
          onClick={() => onVote(true)}
          aria-label={`Agree: ${card.text}`}
          className="text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:ring-primary/40 flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          Agree
          <Icon name="right" size={16} />
        </button>
      </div>
      {card.error && (
        <p role="alert" className="text-error mt-2 text-xs">
          {card.error}
        </p>
      )}
    </motion.article>
  );
}

/** The voted card: same layout, recessed and dimmed, with disagree% left and agree% right. */
function ShadowCard({ card, reduce }: { card: PulseCardData; reduce: boolean }) {
  const known = card.agreeCount !== undefined && card.disagreeCount !== undefined;
  const agreeCount = card.agreeCount ?? 0;
  const total = agreeCount + (card.disagreeCount ?? 0);
  const agreePct = known && total > 0 ? Math.round((100 * agreeCount) / total) : 0;
  const disagreePct = known && total > 0 ? 100 - agreePct : 0;
  const label = known
    ? `${disagreePct}% disagree, ${agreePct}% agree, ${total} ${total === 1 ? "vote" : "votes"}`
    : "Recording your vote";

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.18 }}
      className="neu-inset rounded-2xl p-4"
    >
      <p className="text-on-surface-variant text-base">{card.text}</p>
      <div role="img" aria-label={label} className="mt-4 flex items-center gap-3">
        <span className="flex w-14 shrink-0 flex-col items-start">
          <span
            className={`text-sm tabular-nums ${card.myAgree === false ? "text-primary font-medium" : "text-muted"}`}
          >
            {known ? `${disagreePct}%` : "—"}
          </span>
          <span className="text-muted text-[11px]">Disagree</span>
        </span>
        <span className="bg-surface-container-high flex h-2 min-w-0 flex-1 overflow-hidden rounded-full">
          {known && total > 0 && (
            <>
              <span
                className={`h-full ${disagreePct >= agreePct ? "bg-primary" : "bg-primary/25"}`}
                style={{ width: `${disagreePct}%` }}
              />
              <span
                className={`h-full ${agreePct > disagreePct ? "bg-primary" : "bg-primary/25"}`}
                style={{ width: `${agreePct}%` }}
              />
            </>
          )}
        </span>
        <span className="flex w-14 shrink-0 flex-col items-end">
          <span className={`text-sm tabular-nums ${card.myAgree === true ? "text-primary font-medium" : "text-muted"}`}>
            {known ? `${agreePct}%` : "—"}
          </span>
          <span className="text-muted text-[11px]">Agree</span>
        </span>
      </div>
      <p className="text-muted mt-2 text-center text-xs">
        {known ? `${total.toLocaleString()} ${total === 1 ? "vote" : "votes"}` : "Recording your vote…"}
      </p>
    </motion.article>
  );
}
