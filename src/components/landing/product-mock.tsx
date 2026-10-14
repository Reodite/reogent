import { AssistantIdentity } from "@/src/components/chat/assistant-identity";
import { Icon, type IconName } from "@/src/components/icons";
import { ToolResultCard } from "@/src/components/ui/tool-result-card";
import { courseColor } from "@/src/lib/schedule/calendar/colors";
import type { PaneId } from "@/src/shared/panes";
import Image from "next/image";
import type { ReactNode } from "react";

/** Identifies the tool, agent capability, or Unity page shown in a landing preview. */
export type ProductPreview = PaneId | "grounded" | "research" | "spatial" | "announcements" | "pulse" | "sharing";

function PreviewFrame({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-border-subtle bg-surface text-on-surface-variant flex min-h-11 shrink-0 items-center gap-2 border-b px-4 text-xs">
        <Icon name={icon} size={16} />
        <span className="font-medium">{title}</span>
        <span className="text-muted ml-auto">Example</span>
      </div>
      {children}
    </div>
  );
}

function Prompt({ children }: { children: ReactNode }) {
  return (
    <div className="bg-accent-subtle text-on-surface ml-auto max-w-[90%] rounded-[16px_16px_5px_16px] px-3 py-2 text-sm leading-relaxed">
      {children}
    </div>
  );
}

function MapPreview({ conversation = false }: { conversation?: boolean }) {
  return (
    <PreviewFrame title={conversation ? "Answer canvas" : "Campus map"} icon="map">
      <div className="relative min-h-0 flex-1">
        <Image
          src="/map-light.webp"
          alt=""
          fill
          sizes="(min-width: 640px) 576px, 100vw"
          className="object-cover dark:hidden"
          draggable={false}
        />
        <Image
          src="/map-dark.webp"
          alt=""
          fill
          sizes="(min-width: 640px) 576px, 100vw"
          className="hidden object-cover dark:block"
          draggable={false}
        />
        <div className="absolute inset-x-4 top-4">
          {conversation ? (
            <Prompt>How far is ICCS from the Nest?</Prompt>
          ) : (
            <div className="neu-panel flex max-w-72 items-center gap-3 rounded-xl p-3">
              <Icon name="route" size={20} className="text-muted shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 text-xs">
                <div className="neu-inset bg-surface-container-low flex items-center gap-3 rounded-lg px-3 py-2">
                  <span className="text-muted">From</span>
                  <span className="font-mono">ICCS</span>
                </div>
                <div className="neu-inset bg-surface-container-low flex items-center gap-3 rounded-lg px-3 py-2">
                  <span className="text-muted">To</span>
                  <span>AMS Nest</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="neu-panel absolute bottom-4 left-4 flex items-center gap-3 rounded-xl px-4 py-3">
          <Icon name="walk" size={20} className="text-on-surface-variant" />
          <div>
            <p className="text-sm font-medium">ICCS to AMS Nest</p>
            <p className="text-muted mt-1 font-mono text-xs">9 min walk · 680 m</p>
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

function CourseTile({ code }: { code: string }) {
  const color = courseColor(code);
  return (
    <div
      className="text-on-surface rounded-lg border px-3 py-2"
      style={{ borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 14%, var(--surface))` }}
    >
      <p className="text-xs font-medium">{code}</p>
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HOURS = [9, 10, 11, 12];
const CLASSES = [
  { day: 0, hour: 9, code: "CPSC 110" },
  { day: 2, hour: 9, code: "CPSC 110" },
  { day: 4, hour: 9, code: "CPSC 110" },
  { day: 1, hour: 10, code: "MATH 100" },
  { day: 3, hour: 10, code: "MATH 100" },
  { day: 0, hour: 11, code: "CPSC 121" },
  { day: 2, hour: 11, code: "CPSC 121" },
];

function Timetable({ shared = false }: { shared?: boolean }) {
  return (
    <div className="grid h-48 grid-cols-[1.5rem_repeat(5,minmax(0,1fr))] grid-rows-[1.5rem_repeat(4,minmax(0,1fr))] text-xs">
      {WEEKDAYS.map((day, index) => (
        <span key={day} className="text-muted text-center" style={{ gridColumn: index + 2, gridRow: 1 }}>
          {day}
        </span>
      ))}
      {HOURS.map((hour, index) => (
        <span key={hour} className="text-muted pt-1" style={{ gridColumn: 1, gridRow: index + 2 }}>
          {hour}
        </span>
      ))}
      {WEEKDAYS.flatMap((day, column) =>
        HOURS.map((hour, row) => (
          <span
            key={`${day}-${hour}`}
            className="border-border-subtle border-t border-l"
            style={{ gridColumn: column + 2, gridRow: row + 2 }}
          />
        )),
      )}
      {CLASSES.map(({ day, hour, code }) => {
        const color = courseColor(code);
        return (
          <div
            key={`${day}-${hour}`}
            className="relative m-0.5 flex flex-col justify-center rounded-sm border px-1 leading-tight"
            style={{
              gridColumn: day + 2,
              gridRow: hour - 7,
              borderColor: color,
              backgroundColor: `color-mix(in srgb, ${color} 18%, var(--surface))`,
            }}
          >
            {code.split(" ").map((part) => (
              <span key={part}>{part}</span>
            ))}
          </div>
        );
      })}
      {shared && (
        <div
          className="bg-accent-subtle text-primary relative m-0.5 flex items-center justify-center rounded-sm font-medium"
          style={{ gridColumn: "2 / 7", gridRow: 5 }}
        >
          Everyone is free
        </div>
      )}
    </div>
  );
}

function CourseLookupPreview() {
  return (
    <PreviewFrame title="Course lookup" icon="search">
      <div className="flex flex-1 flex-col gap-3 p-4 sm:px-6">
        <div className="neu-inset bg-surface flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm">
          <Icon name="search" size={16} className="text-muted" />
          <span className="font-mono">CPSC</span>
        </div>
        <div className="divide-border-subtle divide-y">
          {[
            ["CPSC 110", "Computation, Programs, and Programming", "4 credits"],
            ["CPSC 121", "Models of Computation", "4 credits"],
            ["CPSC 210", "Software Construction", "4 credits"],
          ].map(([code, title, credits]) => (
            <div key={code} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-medium">{code}</p>
                <p className="text-on-surface-variant mt-1 truncate text-xs">{title}</p>
              </div>
              <span className="text-muted shrink-0 text-xs">{credits}</span>
              <Icon name="right" size={14} className="text-muted shrink-0" />
            </div>
          ))}
        </div>
        <p className="text-muted mt-auto text-xs">Sections · Prerequisites · Grade history</p>
      </div>
    </PreviewFrame>
  );
}

function PrereqPreview() {
  return (
    <PreviewFrame title="Prereq tree" icon="tree">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-4">
        <span className="neu-raised bg-surface rounded-lg px-5 py-2.5 font-mono text-sm">CPSC 221</span>
        <span className="border-outline-variant h-5 border-l" />
        <div className="grid w-full max-w-xs grid-cols-2 gap-6">
          {["CPSC 210", "CPSC 121"].map((code, index) => (
            <div key={code} className="flex flex-col items-center">
              <div
                className={`border-outline-variant h-4 w-[calc(100%+1.5rem)] border-t ${index === 0 ? "translate-x-1/2 border-l" : "-translate-x-1/2 border-r"}`}
              />
              <span className="neu-raised bg-surface rounded-lg px-3 py-2.5 font-mono text-xs">{code}</span>
              {index === 0 && (
                <>
                  <span className="border-outline-variant h-5 border-l" />
                  <span className="neu-raised bg-surface rounded-lg px-3 py-2.5 font-mono text-xs">CPSC 110</span>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="text-muted mt-5 text-xs">Follow prerequisites back to your first course.</p>
      </div>
    </PreviewFrame>
  );
}

function CalendarPreview() {
  const weekdays = [...WEEKDAYS, "Sat", "Sun"];
  return (
    <PreviewFrame title="Calendar" icon="calendar">
      <div className="flex flex-1 flex-col gap-3 p-4 sm:px-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">September</span>
          <span className="text-muted flex gap-3">
            <Icon name="left" size={14} />
            <Icon name="right" size={14} />
          </span>
        </div>
        <div className="grid flex-1 grid-cols-7 gap-1 text-center text-xs">
          {weekdays.map((day) => (
            <span key={day} className="text-muted">
              {day[0]}
            </span>
          ))}
          {Array.from({ length: 35 }, (_, offset) => offset - 1).map((day) => {
            const event = [8, 9, 18, 23].includes(day);
            return (
              <span
                key={day}
                className={`flex min-h-6 flex-col items-center justify-center gap-1 rounded-sm ${event ? "bg-surface text-on-surface" : "text-muted"}`}
              >
                {day > 0 && day <= 30 ? day : ""}
                {event && <span className="bg-event-academic size-1 rounded-full" />}
              </span>
            );
          })}
        </div>
        <p className="text-muted flex items-center justify-center gap-2 text-xs">
          <span className="bg-event-academic size-1.5 rounded-full" />
          Academic dates & campus events
        </p>
      </div>
    </PreviewFrame>
  );
}

/** Renders illustrative product previews with no live data requests or interactive mock controls. */
export function ProductMock({ feature }: { feature: ProductPreview }) {
  switch (feature) {
    case "grounded":
      return (
        <PreviewFrame title="Conversation" icon="chat1">
          <div className="chat-message-well flex flex-1 flex-col gap-4 p-4 sm:px-6">
            <Prompt>Which courses cover machine learning?</Prompt>
            <div>
              <AssistantIdentity />
              <ToolResultCard
                icon="book2"
                title={<span className="font-mono">CPSC 340</span>}
                metadata="Machine Learning and Data Mining"
              />
              <p className="text-muted mt-3 flex items-center gap-1.5 text-xs">
                <Icon name="file" size={14} />
                Source: UBC Academic Calendar
              </p>
            </div>
          </div>
        </PreviewFrame>
      );
    case "research":
      return (
        <PreviewFrame title="Conversation" icon="chat1">
          <div className="chat-message-well flex flex-1 flex-col gap-4 p-4 sm:px-6">
            <Prompt>What should I budget for first year?</Prompt>
            <div className="flex flex-col gap-2">
              {[
                ["Tuition rates", "get_tuition"],
                ["Student fees", "search_student_fees"],
                ["Living costs", "get_living_costs"],
              ].map(([label, tool]) => (
                <div key={tool} className="flex items-center gap-2 text-xs">
                  <Icon name="check" size={14} className="text-secondary shrink-0" />
                  <span>{label}</span>
                  <span className="text-muted ml-auto hidden font-mono sm:inline">{tool}</span>
                </div>
              ))}
            </div>
            <div>
              <AssistantIdentity />
              <p className="text-on-surface-variant text-sm">Tuition, fees and living costs, in one breakdown.</p>
            </div>
          </div>
        </PreviewFrame>
      );
    case "spatial":
      return <MapPreview conversation />;
    case "map":
      return <MapPreview />;
    case "course-lookup":
      return <CourseLookupPreview />;
    case "prereq-tree":
      return <PrereqPreview />;
    case "degree-planner":
      return (
        <PreviewFrame title="Degree planner" icon="mortarboard">
          <div className="flex flex-1 flex-col gap-4 p-4 sm:px-6">
            <p className="text-on-surface-variant text-xs">BSc · Computer Science</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Year 1", "CPSC 110", "CPSC 121", "MATH 100"],
                ["Year 2", "CPSC 210", "CPSC 221", "MATH 200"],
              ].map(([year, ...courses]) => (
                <div key={year} className="flex flex-col gap-2">
                  <p className="mb-1 text-sm font-medium">{year}</p>
                  {courses.map((code) => (
                    <CourseTile key={code} code={code} />
                  ))}
                </div>
              ))}
            </div>
            <p className="text-muted mt-auto text-xs">Your courses, organized across your degree.</p>
          </div>
        </PreviewFrame>
      );
    case "schedule":
      return (
        <PreviewFrame title="Course schedule" icon="calendarWeek">
          <div className="flex flex-1 flex-col gap-4 p-4 sm:px-6">
            <p className="text-on-surface-variant text-xs">Winter session · Term 1</p>
            <Timetable />
          </div>
        </PreviewFrame>
      );
    case "calendar":
      return <CalendarPreview />;
    case "announcements":
      return (
        <PreviewFrame title="Announcements" icon="announcement">
          <div className="flex flex-1 items-center p-4 sm:p-6">
            <div className="neu-raised neu-shadow-on-surface-container-low bg-surface w-full rounded-xl p-4 sm:p-5">
              <p className="text-base font-medium">Welcome to Announcements</p>
              <p className="text-muted mt-1 text-xs">Reodite team</p>
              <p className="text-on-surface-variant mt-3 text-sm leading-relaxed">
                A place to catch up on Reodite updates, straight from the developers.
              </p>
              <span className="text-primary mt-4 inline-flex items-center gap-1 text-xs font-medium">
                Read announcement
                <Icon name="right" size={14} />
              </span>
            </div>
          </div>
        </PreviewFrame>
      );
    case "pulse":
      return (
        <PreviewFrame title="Pulse" icon="group">
          <div className="flex flex-1 flex-col justify-center gap-4 p-4 sm:p-6">
            <div className="neu-raised neu-shadow-on-surface-container-low bg-surface rounded-2xl p-5">
              <p className="text-base leading-relaxed font-medium sm:text-lg">
                An 8am lecture is worth taking for the right professor.
              </p>
              <div className="text-on-surface-variant mt-6 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1">
                  <Icon name="left" size={16} />
                  Disagree
                </span>
                <span className="flex items-center gap-1">
                  Agree
                  <Icon name="right" size={16} />
                </span>
              </div>
            </div>
            <p className="text-muted text-center text-xs">Vote to see where other students stand.</p>
          </div>
        </PreviewFrame>
      );
    case "sharing":
      return (
        <PreviewFrame title="Schedule" icon="calendarWeek">
          <div className="flex flex-1 flex-col gap-4 p-4 sm:px-6">
            <div className="flex items-center gap-4">
              {["You", "Sam", "Alex"].map((name) => (
                <span key={name} className="flex items-center gap-1.5 text-xs">
                  <span className="bg-surface text-on-surface-variant flex size-6 items-center justify-center rounded-full">
                    {name[0]}
                  </span>
                  {name}
                </span>
              ))}
            </div>
            <Timetable shared />
          </div>
        </PreviewFrame>
      );
  }
}
