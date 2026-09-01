"use client";

import { displayHandles } from "@/src/lib/schedule/display";
import type { Person } from "@/src/lib/schedule/types";
import { AvatarChip } from "./avatar-chip";

interface Props {
  people: Person[];
  meId: string | null;
  onToggle: (id: string, enabled: boolean) => void;
  onEnableAll: () => void;
}

/** Roster of one group. Click a person to show/hide them on the calendar. */
export function PeoplePanel({ people, meId, onToggle, onEnableAll }: Props) {
  if (people.length === 0) return null;

  const names = displayHandles(people);
  const allOn = people.every((p) => p.enabled);

  return (
    <section className="neu-panel rounded-2xl p-3" aria-label="People in this schedule">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-on-surface text-sm font-medium">
          People <span className="text-muted ml-1 font-mono text-xs">{people.length}</span>
        </h3>
        {!allOn && (
          <button type="button" onClick={onEnableAll} className="text-primary text-xs font-medium hover:underline">
            Show all
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-0.5">
        {people.map((p) => {
          const displayName = names.get(p.id) ?? p.handle;
          const courses = p.schedule ? new Set(p.schedule.sections.map((s) => s.courseCode || s.title)).size : 0;
          return (
            <li key={p.id}>
              <div className={`flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 ${p.enabled ? "" : "opacity-50"}`}>
                <AvatarChip avatar={p.avatar} size={30} title={displayName} />
                <button
                  type="button"
                  title="Show/hide on the calendar"
                  aria-pressed={p.enabled}
                  onClick={() => onToggle(p.id, !p.enabled)}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col items-start text-left"
                >
                  <span className="text-on-surface truncate text-sm font-medium">
                    {displayName}
                    {p.id === meId && <span className="text-muted ml-1.5 text-xs font-medium">(you)</span>}
                  </span>
                  <span className="text-on-surface-variant text-xs">
                    {p.schedule ? (
                      <>
                        <span className="font-mono">{courses}</span> {courses === 1 ? "course" : "courses"}
                      </>
                    ) : (
                      "No schedule yet"
                    )}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
