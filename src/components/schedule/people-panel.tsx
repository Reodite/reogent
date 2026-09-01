"use client";

import { Checkbox } from "@/src/components/ui/form-controls";
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
    <section aria-label="People in this schedule">
      <div className="mb-2 flex min-h-9 items-center justify-between">
        <h3 className="text-on-surface text-sm font-medium">
          People <span className="text-muted ml-1 text-xs">{people.length}</span>
        </h3>
        {!allOn && (
          <button type="button" onClick={onEnableAll} className="text-primary text-xs font-medium hover:underline">
            Show all
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {people.map((p) => {
          const displayName = names.get(p.id) ?? p.handle;
          const courses = p.schedule ? new Set(p.schedule.sections.map((s) => s.courseCode || s.title)).size : 0;
          return (
            <li key={p.id}>
              <label
                htmlFor={`schedule-person-${p.id}`}
                className={`hover:bg-surface-container focus-within:ring-primary/40 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 focus-within:ring-2 ${
                  p.enabled ? "" : "opacity-60"
                }`}
              >
                <AvatarChip avatar={p.avatar} size={30} title={displayName} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-on-surface truncate text-sm font-medium">
                    {displayName}
                    {p.id === meId && <span className="text-muted ml-1.5 text-xs font-medium">(you)</span>}
                  </span>
                  <span className="text-on-surface-variant text-xs">
                    {p.schedule ? (
                      <>
                        {courses} {courses === 1 ? "course" : "courses"}
                      </>
                    ) : (
                      "No schedule yet"
                    )}
                  </span>
                </span>
                <Checkbox
                  id={`schedule-person-${p.id}`}
                  label={`Show ${displayName} on the calendar`}
                  checked={p.enabled}
                  onChange={(event) => onToggle(p.id, event.target.checked)}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
