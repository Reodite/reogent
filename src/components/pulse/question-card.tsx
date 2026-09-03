"use client";

import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { PanInfo } from "motion/react";
import { useRef, useState } from "react";

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
 * keyboard, screen-reader, and reduced-motion path). Voted: the card flies off
 * screen, then the shadow result card fades in.
 */
export function PulseQuestionCard({ card, onVote }: { card: PulseCardData; onVote: (agree: boolean) => void }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-6, 6]);
  const agreeHint = useTransform(x, [40, 140], [0, 1]);
  const disagreeHint = useTransform(x, [-140, -40], [1, 0]);
  // Already voted at mount (a reload, or a round you came back to): there is no
  // front card to fly off, so nothing would ever set this and the slot renders
  // empty. Start exited so the result card shows straight away.
  const [exited, setExited] = useState(card.myAgree !== undefined);
  const exitDir = useRef<boolean>(true);

  const voted = card.myAgree !== undefined;
  const showShadow = voted && (exited || !!reduce);

  const castVote = (agree: boolean) => {
    exitDir.current = agree;
    onVote(agree);
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const vote = voteFromDrag(info.offset.x, info.velocity.x);
    if (vote !== null) castVote(vote);
  };

  return (
    <div className="relative">
      <AnimatePresence custom={exitDir} onExitComplete={() => setExited(true)}>
        {!voted && (
          <motion.article
            key="front"
            drag={reduce ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.9}
            style={reduce ? undefined : { x, rotate }}
            whileDrag={reduce ? undefined : { scale: 1.01 }}
            onDragEnd={handleDragEnd}
            variants={{
              exit: (dir: React.RefObject<boolean>) => {
                if (reduce) return { opacity: 0 };
                const right = dir?.current !== false;
                return { x: right ? 600 : -600, opacity: 0, rotate: right ? 15 : -15 };
              },
            }}
            exit="exit"
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 28 }}
            className={`neu-panel bg-surface relative touch-pan-y rounded-2xl p-4 select-none ${
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
            <div className="mt-3 flex items-center justify-between px-1">
              <motion.button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => castVote(false)}
                aria-label={`Disagree: ${card.text}`}
                whileTap={reduce ? undefined : { x: -8, scale: 0.95 }}
                className="text-muted hover:text-on-surface -mx-2 -my-3 inline-flex min-h-11 items-center px-2 py-3 text-sm transition-colors select-none"
              >
                Disagree
              </motion.button>
              <motion.button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => castVote(true)}
                aria-label={`Agree: ${card.text}`}
                whileTap={reduce ? undefined : { x: 8, scale: 0.95 }}
                className="text-muted hover:text-on-surface -mx-2 -my-3 inline-flex min-h-11 items-center px-2 py-3 text-sm transition-colors select-none"
              >
                Agree
              </motion.button>
            </div>
            {card.error && (
              <p role="alert" className="text-error mt-2 text-xs">
                {card.error}
              </p>
            )}
          </motion.article>
        )}
      </AnimatePresence>
      {showShadow && <ShadowCard card={card} reduce={!!reduce} />}
    </div>
  );
}

/** The voted card: same layout, recessed and dimmed, with disagree% left and
 *  agree% right. Also renders locked-round results in the history list. */
export function ShadowCard({ card, reduce }: { card: PulseCardData; reduce: boolean }) {
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
      initial={reduce ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: "easeOut" }}
      className="neu-inset bg-surface-container rounded-2xl p-4"
    >
      <p className="text-on-surface-variant text-base">{card.text}</p>
      <div role="img" aria-label={label} className="mt-4 flex items-center gap-3">
        <span className="flex w-14 shrink-0 flex-col items-start">
          <span
            className={`text-sm tabular-nums ${card.myAgree === false ? "text-primary font-medium" : "text-muted"}`}
          >
            {known ? `${disagreePct}%` : "—"}
          </span>
          <span className="text-muted text-xs">Disagree</span>
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
          <span className="text-muted text-xs">Agree</span>
        </span>
      </div>
      <p className="text-muted mt-2 text-center text-xs">
        {known ? `${total.toLocaleString()} ${total === 1 ? "vote" : "votes"}` : "Recording your vote…"}
      </p>
    </motion.article>
  );
}
