import { AssistantIdentity } from "@/src/components/chat/assistant-identity";
import { Icon, type IconName } from "@/src/components/icons";
import { InfoChip } from "@/src/components/ui/info-chip";
import { ToolResultCard } from "@/src/components/ui/tool-result-card";
import { describeToolCall } from "@/src/lib/format";
import { SEASON_META } from "@/src/lib/planner-model";
import { courseColor } from "@/src/lib/schedule/calendar/colors";
import { buildMonthGrid, formatMonthHeading, parseISODate, toISODate } from "@/src/shared/calendar/date-math";
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

// Mirrors CitationChip's linked style without rendering a link.
function Citation({ index }: { index: number }) {
  return (
    <span className="bg-primary-container/60 text-on-primary-container ml-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 align-super font-mono text-xs leading-none">
      [{index}]
    </span>
  );
}

function SourcesSummary({ count }: { count: number }) {
  return (
    <p className="text-on-surface-variant mt-2 inline-flex items-center gap-1.5 text-xs font-medium">
      <Icon name="down" size={14} />
      Sources used ({count})
    </p>
  );
}

// Mirrors the conversation's unmapped tool activity badge.
function Activity({ name, input }: { name: string; input: Record<string, unknown> }) {
  return (
    <span
      data-widget={name}
      className="border-primary/20 bg-primary/10 text-primary inline-flex w-fit max-w-full items-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-1 font-mono text-xs"
    >
      <Icon name="search" size={14} className="shrink-0" />
      <span className="truncate leading-4">{describeToolCall(name, input)}</span>
    </span>
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
            <Prompt>How do I walk from ICCS to the Nest?</Prompt>
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
            <p className="text-sm font-medium">Walking route</p>
            <p className="text-muted mt-1 text-xs">ICCS to AMS Nest</p>
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

// CPSC 110 in 2024W, pooled across sections the way course records pool them.
const CPSC_110_GRADES = [167, 20, 30, 39, 54, 69, 79, 73, 101, 148, 419];

function CourseLookupPreview() {
  const max = Math.max(...CPSC_110_GRADES);
  return (
    <PreviewFrame title="Course lookup" icon="search">
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:px-6">
        <div>
          <div className="flex flex-wrap items-baseline gap-1.5">
            <p className="font-mono text-lg font-medium">CPSC 110</p>
            <InfoChip>2024W</InfoChip>
            <InfoChip>4 cr</InfoChip>
          </div>
          <p className="text-on-surface-variant mt-1 truncate text-sm">Computation, Programs, and Programming</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            ["Average", "75.7%"],
            ["Enrolled", "1,199"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="neu-inset bg-surface-container-low flex flex-col items-center gap-1 rounded-lg px-2 py-2"
            >
              <span className="text-muted text-xs font-medium tracking-[0.05em] uppercase">{label}</span>
              <span className="text-sm font-medium">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="border-surface-container flex min-h-0 flex-1 items-end gap-1 border-b">
            {CPSC_110_GRADES.map((count, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: Buckets keep a fixed order.
                key={index}
                className="bg-primary/40 min-w-0 flex-1 rounded-t-sm"
                style={{ height: `${(count / max) * 100}%` }}
              />
            ))}
          </div>
          <div className="text-muted flex justify-between text-xs">
            <span>&lt;50</span>
            <span>Grade distribution · 1,199 students</span>
            <span>90–100</span>
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

function PrereqNode({ code, title }: { code: string; title: string }) {
  return (
    <div className="neu-raised bg-surface w-full max-w-44 rounded-lg px-3 py-2 text-center">
      <p className="font-mono text-sm">{code}</p>
      <p className="text-muted mt-0.5 truncate text-xs">{title}</p>
    </div>
  );
}

function PrereqPreview() {
  const edge = <span className="border-outline-variant h-4 border-l" />;
  return (
    <PreviewFrame title="Prereq tree" icon="tree">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-4 sm:px-6">
        <PrereqNode code="CPSC 210" title="Software Construction" />
        {edge}
        <div className="neu-raised bg-surface rounded-full px-3 py-1">
          <p className="text-muted text-xs tracking-wide uppercase">one of</p>
        </div>
        <div className="relative grid w-full max-w-96 grid-cols-2 gap-4">
          <span className="border-outline-variant absolute inset-x-1/4 top-0 border-t" />
          <div className="flex flex-col items-center">
            {edge}
            <PrereqNode code="CPSC 107" title="Systematic Program Design" />
            {edge}
            <PrereqNode code="CPSC 103" title="Introduction to Systematic Program Design" />
          </div>
          <div className="flex flex-col items-center">
            {edge}
            <PrereqNode code="CPSC 110" title="Computation, Programs, and Programming" />
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

function PlannedCourse({
  code,
  title,
  credits,
  invalid = false,
}: {
  code: string;
  title: string;
  credits: number;
  invalid?: boolean;
}) {
  return (
    <div
      className={`neu-raised bg-surface-container flex flex-col rounded-lg border px-2 py-1 ${invalid ? "border-error" : "border-transparent"}`}
    >
      <div className="flex items-center gap-1">
        <span className={`flex-1 truncate text-sm leading-5 font-medium ${invalid ? "text-error" : "text-on-surface"}`}>
          {code}
        </span>
        <Icon name={invalid ? "alert" : "info"} size={14} className={invalid ? "text-error" : "text-muted"} />
      </div>
      <div className="flex items-center gap-2 leading-5">
        <span className="text-on-surface-variant min-w-0 flex-1 truncate text-xs">{title}</span>
        <span className="text-muted shrink-0 text-xs tabular-nums">{credits} cr</span>
      </div>
    </div>
  );
}

type PlannedTerm = {
  season: "w1" | "w2";
  courses: { code: string; title: string; credits: number; invalid?: boolean }[];
};

const PLANNED_TERMS: PlannedTerm[] = [
  {
    season: "w1",
    courses: [
      { code: "CPSC 110", title: "Computation, Programs, and Programming", credits: 4 },
      { code: "MATH 100", title: "Differential Calculus with Applications", credits: 3 },
      { code: "CPSC 210", title: "Software Construction", credits: 4, invalid: true },
    ],
  },
  {
    season: "w2",
    courses: [
      { code: "CPSC 121", title: "Models of Computation", credits: 4 },
      { code: "MATH 101", title: "Integral Calculus with Applications", credits: 3 },
    ],
  },
];

function DegreePlannerPreview() {
  const credits = (courses: readonly { credits: number }[]) => courses.reduce((sum, course) => sum + course.credits, 0);
  return (
    <PreviewFrame title="Degree planner" icon="mortarboard">
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-3 sm:px-6">
        <div className="flex items-baseline px-1">
          <p className="text-sm font-medium">Year 1</p>
          <span className="text-muted ml-auto text-xs tabular-nums">
            {credits(PLANNED_TERMS.flatMap((term) => term.courses))} cr
          </span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
          {PLANNED_TERMS.map(({ season, courses }) => (
            <div
              key={season}
              className="neu-inset bg-surface-container-low flex min-w-0 flex-col gap-1.5 rounded-xl p-2.5"
            >
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-medium">{SEASON_META[season].short}</span>
                <span className="text-muted truncate">{SEASON_META[season].months}</span>
                <span className="text-muted ml-auto tabular-nums">{credits(courses)} cr</span>
              </div>
              {courses.map((course) => (
                <PlannedCourse key={course.code} {...course} />
              ))}
            </div>
          ))}
        </div>
        <p className="text-error text-xs">CPSC 210 needs CPSC 107 or CPSC 110 in an earlier term.</p>
      </div>
    </PreviewFrame>
  );
}

type ClassBlock = { code: string; day: number; start: number; end: number; lane?: "start" | "end" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const FIRST_HOUR = 9;
const HOURS = [9, 10, 11, 12];

function mwf(code: string, start: number, end = start + 1): ClassBlock[] {
  return [0, 2, 4].map((day) => ({ code, day, start, end }));
}

function tth(code: string, start: number, end: number): ClassBlock[] {
  return [1, 3].map((day) => ({ code, day, start, end }));
}

const BUILDER_CLASSES: ClassBlock[] = [
  ...mwf("CPSC 110", 9),
  ...tth("MATH 100", 9.5, 11),
  ...mwf("CPSC 121", 11).map((block) => (block.day === 2 ? { ...block, lane: "start" as const } : block)),
  { code: "CHEM 121", day: 2, start: 11, end: 13, lane: "end" },
];
const CONFLICTS = new Set(["CPSC 121-2", "CHEM 121-2"]);

const GROUP_CLASSES: ClassBlock[] = [
  ...mwf("CPSC 110", 9),
  ...mwf("PSYC 100", 10),
  ...mwf("CPSC 121", 11),
  ...mwf("ECON 101", 12),
  ...tth("ENGL 110", 9, 10.5),
  ...tth("MATH 100", 10.5, 12),
];
const GROUP_FREE = [1, 3].map((day) => ({ day, start: 12, end: 13 }));

// Places a block on half-hour grid rows below the weekday header.
function rows(start: number, end: number) {
  return `${(start - FIRST_HOUR) * 2 + 2} / ${(end - FIRST_HOUR) * 2 + 2}`;
}

function Timetable({
  classes,
  conflicts = new Set(),
  free = [],
}: {
  classes: ClassBlock[];
  conflicts?: Set<string>;
  free?: { day: number; start: number; end: number }[];
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1.5rem_repeat(5,minmax(0,1fr))] grid-rows-[1.25rem_repeat(8,minmax(0,1fr))] text-xs">
      {WEEKDAYS.map((day, index) => (
        <span key={day} className="text-muted text-center" style={{ gridColumn: index + 2, gridRow: 1 }}>
          {day}
        </span>
      ))}
      {HOURS.map((hour) => (
        <span key={hour} className="text-muted -mt-1.5" style={{ gridColumn: 1, gridRow: rows(hour, hour + 1) }}>
          {hour}
        </span>
      ))}
      {WEEKDAYS.flatMap((day, column) =>
        HOURS.map((hour) => (
          <span
            key={`${day}-${hour}`}
            className="border-border-subtle border-t border-l"
            style={{ gridColumn: column + 2, gridRow: rows(hour, hour + 1) }}
          />
        )),
      )}
      {free.map(({ day, start, end }) => (
        <span
          key={`free-${day}`}
          data-free-time
          className="border-primary/40 bg-primary/10 text-primary relative m-0.5 flex items-center justify-center rounded-md border border-dashed font-medium"
          style={{ gridColumn: day + 2, gridRow: rows(start, end) }}
        >
          Free
        </span>
      ))}
      {classes.map(({ code, day, start, end, lane }) => {
        const color = courseColor(code);
        const conflict = conflicts.has(`${code}-${day}`);
        return (
          <div
            key={`${code}-${day}`}
            data-conflict={conflict || undefined}
            className={`relative m-0.5 flex flex-col justify-center overflow-hidden rounded-sm border px-1 leading-tight ${
              conflict ? "ring-error/70 ring-2" : ""
            } ${lane === "start" ? "mr-[50%]" : lane === "end" ? "ml-[50%]" : ""}`}
            style={{
              gridColumn: day + 2,
              gridRow: rows(start, end),
              borderColor: color,
              backgroundColor: `color-mix(in srgb, ${color} 18%, var(--surface))`,
            }}
          >
            {code.split(" ").map((part) => (
              <span key={part} className="truncate">
                {part}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const CALENDAR_STYLES = {
  academic: { label: "Academic", dot: "bg-primary" },
  holiday: { label: "Holiday", dot: "bg-tertiary" },
  event: { label: "Campus event", dot: "bg-secondary" },
} as const;

// UBC key dates, statutory holidays, and the weekly Chung | Lind Gallery tour for September 2026.
const SEPTEMBER_EVENTS: { date: string; kind: keyof typeof CALENDAR_STYLES; label: string }[] = [
  { date: "2026-09-02", kind: "event", label: "Chung | Lind Gallery drop-in tour" },
  { date: "2026-09-07", kind: "holiday", label: "Labour Day" },
  { date: "2026-09-08", kind: "academic", label: "Term 1 classes begin" },
  { date: "2026-09-09", kind: "event", label: "Chung | Lind Gallery drop-in tour" },
  { date: "2026-09-16", kind: "event", label: "Chung | Lind Gallery drop-in tour" },
  { date: "2026-09-21", kind: "academic", label: "Last day to drop a Term 1 course without a W" },
  { date: "2026-09-23", kind: "event", label: "Chung | Lind Gallery drop-in tour" },
  { date: "2026-09-28", kind: "academic", label: "Last day to drop a full-year course without a W" },
  { date: "2026-09-30", kind: "holiday", label: "National Day for Truth and Reconciliation" },
  { date: "2026-09-30", kind: "event", label: "Chung | Lind Gallery drop-in tour" },
];

function CalendarPreview() {
  const month = parseISODate("2026-09-01");
  const weekdays = ["Sun", ...WEEKDAYS, "Sat"];
  const agenda = SEPTEMBER_EVENTS.filter(({ date }) => date >= "2026-09-07" && date <= "2026-09-09");
  return (
    <PreviewFrame title="Calendar" icon="calendar">
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 sm:px-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{formatMonthHeading(month)}</span>
          <span className="text-muted flex gap-3">
            <Icon name="left" size={14} />
            <Icon name="right" size={14} />
          </span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-7 gap-1 text-center text-xs">
          {weekdays.map((day) => (
            <span key={day} className="text-muted">
              {day[0]}
            </span>
          ))}
          {buildMonthGrid(month)
            .flat()
            .map((date) => {
              if (!date) return null;
              const iso = toISODate(date);
              const current = date.getUTCMonth() === month.getUTCMonth();
              const events = current ? SEPTEMBER_EVENTS.filter((event) => event.date === iso) : [];
              return (
                <span
                  key={iso}
                  data-calendar-day={iso}
                  className={`flex min-h-6 flex-col items-center justify-center gap-0.5 rounded-sm leading-none ${current ? "bg-surface text-on-surface" : "text-muted"}`}
                >
                  {date.getUTCDate()}
                  {events.length > 0 && (
                    <span className="flex gap-0.5">
                      {events.map((event) => (
                        <span
                          key={event.kind}
                          data-calendar-marker={event.kind}
                          className={`${CALENDAR_STYLES[event.kind].dot} size-1 rounded-full`}
                        />
                      ))}
                    </span>
                  )}
                </span>
              );
            })}
        </div>
        <ul className="flex flex-col gap-1 text-xs">
          {agenda.map(({ date, kind, label }) => (
            <li key={date} className="flex items-center gap-2">
              <span className={`${CALENDAR_STYLES[kind].dot} size-1.5 shrink-0 rounded-full`} />
              <span className="text-muted w-10 shrink-0 tabular-nums">Sep {Number(date.slice(-2))}</span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="text-muted shrink-0">{CALENDAR_STYLES[kind].label}</span>
            </li>
          ))}
        </ul>
      </div>
    </PreviewFrame>
  );
}

function PulsePreview() {
  return (
    <PreviewFrame title="Pulse" icon="group">
      <div className="flex flex-1 flex-col justify-center gap-3 p-4 sm:px-6">
        <div className="neu-raised neu-shadow-on-surface-container-low bg-surface rounded-2xl px-4 pt-2 pb-1">
          <span className="bg-outline/40 mx-auto mb-2 block h-1.5 w-10 rounded-full" />
          <p className="text-on-surface text-sm sm:text-base">
            An 8am lecture is worth taking for the right professor.
          </p>
          <div className="text-on-surface-variant flex justify-between text-sm font-medium">
            <span className="px-3 py-2">Disagree</span>
            <span className="px-3 py-2">Agree</span>
          </div>
        </div>
        <div className="neu-inset bg-surface-container rounded-2xl p-4">
          <p className="text-on-surface-variant text-sm">The Nest is the best place to eat on campus.</p>
          <div className="mt-3 flex items-center gap-3 text-xs">
            <span className="text-muted w-14 shrink-0">
              <span className="block text-sm tabular-nums">38%</span>
              Disagree
            </span>
            <span className="bg-surface-container-high flex h-2 flex-1 overflow-hidden rounded-full">
              <span className="bg-primary/25 h-full w-[38%]" />
              <span className="bg-primary h-full w-[62%]" />
            </span>
            <span className="text-muted w-14 shrink-0 text-right">
              <span className="text-primary block text-sm font-medium tabular-nums">62%</span>
              Agree
            </span>
          </div>
          <p className="text-muted mt-2 text-center text-xs">412 votes</p>
        </div>
      </div>
    </PreviewFrame>
  );
}

const GROUP = [
  { name: "You", color: "var(--primary)" },
  { name: "Sam", color: "var(--secondary)" },
  { name: "Alex", color: "var(--tertiary)" },
];

/** Renders illustrative product previews with no live data requests or interactive mock controls. */
export function ProductMock({ feature }: { feature: ProductPreview }) {
  switch (feature) {
    case "grounded":
      return (
        <PreviewFrame title="Conversation" icon="chat1">
          <div className="chat-message-well flex flex-1 flex-col gap-3 p-4 sm:px-6">
            <Prompt>Which courses cover machine learning?</Prompt>
            <div>
              <AssistantIdentity />
              <p className="text-on-surface text-sm leading-relaxed">
                CPSC 340 covers classification, clustering and regression.
                <Citation index={1} />
              </p>
              <ToolResultCard
                className="mt-3"
                icon="book2"
                title={<span className="font-mono">CPSC 340</span>}
                metadata="Machine Learning and Data Mining · 3 cr"
              />
              <SourcesSummary count={1} />
            </div>
          </div>
        </PreviewFrame>
      );
    case "research":
      return (
        <PreviewFrame title="Conversation" icon="chat1">
          <div className="chat-message-well flex flex-1 flex-col gap-3 p-4 sm:px-6">
            <Prompt>What&apos;s on during the first week of Term 1?</Prompt>
            <div className="flex flex-col gap-1.5">
              <Activity name="get_key_dates" input={{ query: "Term 1" }} />
              <Activity name="find_events" input={{ from_date: "2026-09-08" }} />
            </div>
            <div>
              <AssistantIdentity />
              <p className="text-on-surface text-sm leading-relaxed">
                Term 1 classes begin Tuesday, September 8.
                <Citation index={1} /> On Wednesday, the Chung | Lind Gallery runs a drop-in tour in the Irving K.
                Barber Learning Centre.
                <Citation index={2} />
              </p>
              <SourcesSummary count={2} />
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
      return <DegreePlannerPreview />;
    case "schedule":
      return (
        <PreviewFrame title="Course schedule" icon="calendarWeek">
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 sm:px-6">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-on-surface-variant">Winter session · Term 1</span>
              <InfoChip tone="error" className="ml-auto">
                Conflict
              </InfoChip>
            </div>
            <Timetable classes={BUILDER_CLASSES} conflicts={CONFLICTS} />
            <p className="text-muted flex justify-between gap-3 text-xs">
              <span className="text-error">CPSC 121 overlaps CHEM 121 on Wed.</span>
              <span>Illustrative class times</span>
            </p>
          </div>
        </PreviewFrame>
      );
    case "calendar":
      return <CalendarPreview />;
    case "announcements":
      return (
        <PreviewFrame title="Announcements" icon="announcement">
          <div className="flex flex-1 flex-col gap-4 p-4 sm:px-6">
            <div>
              <p className="text-base font-medium">Announcements</p>
              <p className="text-muted mt-1 text-xs">Updates from the Reodite developers.</p>
            </div>
            <div className="neu-raised neu-shadow-on-surface-container-low bg-surface w-full rounded-xl p-4 sm:p-5">
              <p className="text-base font-medium">Welcome to Announcements</p>
              <p className="text-muted mt-1 text-xs">October 13, 2026 · Reodite team</p>
              <p className="text-on-surface-variant mt-3 text-sm leading-relaxed">
                A place to catch up on Reodite updates, straight from the developers.
              </p>
              <span className="text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
                Read announcement
                <Icon name="right" size={16} />
              </span>
            </div>
          </div>
        </PreviewFrame>
      );
    case "pulse":
      return <PulsePreview />;
    case "sharing":
      return (
        <PreviewFrame title="Shared schedule" icon="calendarWeek">
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 sm:px-6">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium">Study group</p>
              <div className="ml-auto flex items-center gap-3">
                {GROUP.map(({ name, color }) => (
                  <span key={name} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="bg-surface-container-low flex size-6 items-center justify-center rounded-full border-2 font-medium"
                      style={{ borderColor: color }}
                    >
                      {name[0]}
                    </span>
                    <span className="hidden sm:inline">{name}</span>
                  </span>
                ))}
              </div>
            </div>
            <Timetable classes={GROUP_CLASSES} free={GROUP_FREE} />
            <p className="text-muted text-xs">Common free time · Tue and Thu from 12 PM</p>
          </div>
        </PreviewFrame>
      );
  }
}
