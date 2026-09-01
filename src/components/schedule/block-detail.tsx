"use client";

import { Button } from "@/src/components/ui/button";
import type { MergedBlock } from "@/src/lib/schedule/calendar/buildCalendar";
import { courseColor } from "@/src/lib/schedule/calendar/colors";
import { minutesToFullLabel } from "@/src/lib/schedule/util/time";
import { useEffect } from "react";
import { AvatarChip } from "./avatar-chip";
import { displayCode } from "./block-format";
import { useDialogFocus } from "./use-dialog-focus";

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
  const dialogRef = useDialogFocus<HTMLDivElement>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A meeting listed in two rooms shows up as two same-day/time patterns; show
  // each weekly slot once (rooms are surfaced in the "Where" row).
  const meetingSlots = s.meetings.filter((m, i) => {
    const key = `${m.days.join(" ")}|${m.startMin}|${m.endMin}`;
    return s.meetings.findIndex((o) => `${o.days.join(" ")}|${o.startMin}|${o.endMin}` === key) === i;
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close course details"
        tabIndex={-1}
        onClick={onClose}
        className="bg-on-surface/20 absolute inset-0 cursor-default"
      />
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={displayCode(s)}
        className="neu-panel relative w-full max-w-md rounded-2xl p-5"
      >
        <div className="flex items-center gap-2.5">
          <span className="size-3 shrink-0 rounded-full" style={{ background: color }} />
          <h2 className="text-on-surface text-base font-medium">
            {s.courseCode ? (
              <>
                {displayCode(s)} — {s.title}
              </>
            ) : (
              s.title
            )}
          </h2>
        </div>
        <p className="text-on-surface-variant mt-1 text-sm">
          {s.component}
          {s.termStart && s.termEnd ? ` · ${fmtDate(s.termStart)} → ${fmtDate(s.termEnd)}` : null}
        </p>

        <dl className="mt-4 flex flex-col gap-3 text-sm">
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

        <div className="mt-5 flex justify-end">
          <Button data-dialog-initial-focus size="prominent" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
