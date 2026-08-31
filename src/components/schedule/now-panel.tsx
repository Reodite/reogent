"use client";

import { displayHandles } from "@/src/lib/schedule/display";
import { whoIsFreeNow } from "@/src/lib/schedule/features/whoIsFreeNow";
import type { Person } from "@/src/lib/schedule/types";
import { minutesToFullLabel } from "@/src/lib/schedule/util/time";
import { AvatarChip } from "./avatar-chip";

interface Props {
  people: Person[];
  now: Date;
}

/** prefer the compact code; clip a code-less title for the one-line row */
function shortLabel(section: { courseCode: string; title: string }): string {
  if (section.courseCode) return section.courseCode.replace(/_V(?=\s)/, "");
  return section.title.length > 26 ? `${section.title.slice(0, 24)}…` : section.title;
}

/** Live panel: who is in class right now and who is free. */
export function NowPanel({ people, now }: Props) {
  const withSchedules = people.filter((p) => p.schedule);
  if (withSchedules.length === 0) return null;

  const statuses = whoIsFreeNow(withSchedules, now);
  const names = displayHandles(people);

  return (
    <section className="neu-panel rounded-2xl p-3" aria-label="Right now">
      <h3 className="text-muted mb-2 flex items-baseline justify-between px-1 text-xs font-semibold tracking-wide uppercase">
        Right now
        <span className="text-[11px] font-normal tabular-nums">
          {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
      </h3>
      <ul className="flex flex-col gap-1.5">
        {statuses.map(({ person, current, next, hasClassesToday }) => (
          <li key={person.id} className="flex items-center gap-2 px-1">
            <AvatarChip avatar={person.avatar} size={24} title={names.get(person.id)} />
            <div className="min-w-0 flex-1">
              <div className="text-on-surface truncate text-sm font-medium">{names.get(person.id)}</div>
              {current ? (
                <div className="text-on-surface-variant truncate text-xs">
                  {shortLabel(current.section)}
                  {current.pattern.buildingCode
                    ? ` · ${current.pattern.buildingCode} ${current.pattern.room ?? ""}`
                    : ""}
                  {` · til ${minutesToFullLabel(current.pattern.endMin)}`}
                </div>
              ) : (
                <div className="text-secondary truncate text-xs">
                  free
                  {next
                    ? ` · ${shortLabel(next.section)} at ${minutesToFullLabel(next.pattern.startMin)}`
                    : hasClassesToday
                      ? " · rest of day" // done for today ≠ free all day
                      : " all day"}
                </div>
              )}
            </div>
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${current ? "bg-error" : "bg-secondary"}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}
