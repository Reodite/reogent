"use client";

import { Button } from "@/src/components/ui/button";
import { DialogActions, DialogHeader, DialogPanel, DialogRoot } from "@/src/components/ui/dialog";
import type { MergedBlock } from "@/src/lib/schedule/calendar/buildCalendar";
import { courseColor } from "@/src/lib/schedule/calendar/colors";
import { minutesToFullLabel } from "@/src/lib/schedule/util/time";
import { AvatarChip } from "./avatar-chip";
import { displayCode } from "./block-format";

interface Props {
  block: MergedBlock;
  onClose: () => void;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Detail sheet for one merged block: section facts + everyone enrolled. */
export function BlockDetail({ block, onClose }: Props) {
  const s = block.section;
  const color = courseColor(s);

  // A meeting listed in two rooms shows up as two same-day/time patterns; show
  // each weekly slot once (rooms are surfaced in the "Where" row).
  const meetingSlots = s.meetings.filter((m, i) => {
    const key = `${m.days.join(" ")}|${m.startMin}|${m.endMin}`;
    return s.meetings.findIndex((o) => `${o.days.join(" ")}|${o.startMin}|${o.endMin}` === key) === i;
  });

  return (
    <DialogRoot onDismiss={onClose} backdropLabel="Close course details">
      <DialogPanel aria-label={displayCode(s)} size="md" padding="none" className="flex flex-col overflow-hidden">
        <DialogHeader
          title={s.courseCode ? `${displayCode(s)} — ${s.title}` : s.title}
          className="p-4 pb-0 sm:p-6 sm:pb-0"
          leading={<span aria-hidden="true" className="size-3 rounded-full" style={{ background: color }} />}
          description={
            <>
              {s.component}
              {s.termStart && s.termEnd ? ` · ${fmtDate(s.termStart)} → ${fmtDate(s.termEnd)}` : null}
            </>
          }
        />

        <section
          data-dialog-scroll
          aria-label="Course facts and roster"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users scroll course facts and the enrollment roster.
          tabIndex={0}
          className="min-h-0 overflow-y-auto p-4 sm:px-6"
        >
          <dl className="flex flex-col gap-3 text-sm">
            {s.instructors.length > 0 && (
              <div className="flex gap-3">
                <dt className="text-muted w-16 shrink-0">Taught by</dt>
                <dd className="text-on-surface">{s.instructors.join(", ")}</dd>
              </div>
            )}
            <div className="flex gap-3">
              <dt className="text-muted w-16 shrink-0">Meets</dt>
              <dd className="text-on-surface">
                {meetingSlots.map((m) => (
                  <div key={`${m.days.join("")}-${m.startMin}`} className="tabular-nums">
                    {m.days.join(" ")} {minutesToFullLabel(m.startMin)}–{minutesToFullLabel(m.endMin)}
                  </div>
                ))}
              </dd>
            </div>
            {(block.pattern.buildingName || block.rooms.length > 0) && (
              <div className="flex gap-3">
                <dt className="text-muted w-16 shrink-0">Where</dt>
                <dd className="text-on-surface">
                  {block.pattern.buildingName}
                  {block.pattern.buildingCode ? <span> ({block.pattern.buildingCode})</span> : null}
                  {block.pattern.floor ? (
                    <>
                      {" "}
                      · floor <span>{block.pattern.floor}</span>
                    </>
                  ) : null}
                  {block.rooms.length > 0 ? (
                    <>
                      {` · room${block.rooms.length > 1 ? "s" : ""} `}
                      <span>{block.rooms.join(", ")}</span>
                    </>
                  ) : null}
                </dd>
              </div>
            )}
            <div className="flex gap-3">
              <dt className="text-muted w-16 shrink-0">Who</dt>
              <dd className="flex flex-wrap gap-x-3 gap-y-1.5">
                {block.people.map((p) => (
                  <span key={p.id} className="text-on-surface inline-flex items-center gap-1.5 text-sm">
                    <AvatarChip avatar={p.avatar} size={20} />
                    {p.handle}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </section>

        <footer className="shrink-0 px-4 pb-4 sm:px-6 sm:pb-6">
          <DialogActions spacing="none">
            <Button data-dialog-initial-focus size="prominent" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </footer>
      </DialogPanel>
    </DialogRoot>
  );
}
