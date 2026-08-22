"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { GradeDistributionChart } from "@/src/components/course-lookup/grade-distribution-chart";
import { SectionRow } from "@/src/components/course-lookup/section-row";
import { Icon } from "@/src/components/icons";
import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import { getTermLabel } from "@/src/server/course-records";

function FieldRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted text-xs font-medium tracking-[0.05em] uppercase">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>{value}</dd>
    </div>
  );
}

function SectionTable({ sections }: { sections: CourseSection[] }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Course sections</caption>
      <thead className="sr-only">
        <tr>
          <th>Term</th>
          <th>Days</th>
          <th>Time</th>
          <th>Instructor</th>
        </tr>
      </thead>
      <tbody>
        {sections.map((s) => (
          <SectionRow key={`${s.section}-${s.term ?? ""}`} section={s} />
        ))}
      </tbody>
    </table>
  );
}

function formatPct(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "N/A";
  return `${Math.round(v)}%`;
}

function StatBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container flex flex-col items-center gap-0.5 rounded-lg px-2 py-2">
      <span className="text-muted text-[10px] font-medium tracking-[0.05em] uppercase">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

/** Course Record renderer. Null-or-empty fields are omitted rather than shown as placeholders (REQ-2.2). The Prereq Tree affordance opens the tree pane rooted at this course (REQ-4.1). */
export function CourseDetailCard({
  record,
  session,
}: {
  record: CourseDoc & {
    session?: string;
    average?: number;
    reported?: number;
    buckets?: Record<string, number>;
    weightedMedian?: number | null;
    p25?: number | null;
    p75?: number | null;
    high?: number | null;
    low?: number | null;
    mode?: string | null;
    stdDev?: number | null;
    term?: unknown;
    highlightBucket?: string;
  };
  session?: string;
}) {
  const { setActiveChannel } = useChatShell();
  const sess = (session ?? (record as { session?: string }).session) as string | undefined;
  const isRecent = sess ? ["2024W", "2024S", "2025W", "2025S"].includes(sess) : false;
  const buckets = (record as { buckets?: Record<string, number> }).buckets;
  const hasDistribution = buckets != null;
  return (
    <article className="bg-surface-container-low flex flex-col gap-2.5 rounded-lg p-3">
      <header className="flex flex-wrap items-baseline gap-1.5">
        <h3 className="font-mono text-base leading-tight font-medium">{record.code}</h3>
        {sess && (
          <span className="bg-surface-container text-on-surface-variant rounded-full px-2 py-0.5 text-xs">{sess}</span>
        )}
        {record.credits != null && (
          <span className="bg-surface-container text-on-surface-variant rounded-full px-2 py-0.5 text-xs">
            {record.credits} cr
          </span>
        )}
        {record.prerequisite && (
          <button
            data-action="open-prereq-tree"
            data-code={record.code}
            type="button"
            onClick={() => setActiveChannel("prereq-tree", { root: record.code, selections: {} })}
            className="text-primary border-primary hover:bg-accent-subtle focus-visible:ring-primary/40 inline-flex min-h-[44px] items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95"
          >
            <Icon name="tree" size={14} /> Prereq Tree
          </button>
        )}
      </header>
      <p className="text-sm font-medium">{record.title}</p>
      {record.description && <p className="text-on-surface-variant text-sm leading-relaxed">{record.description}</p>}
      {hasDistribution && <CourseStatsBand record={record as unknown as Record<string, unknown>} isRecent={isRecent} />}
      {hasDistribution && (
        <GradeDistributionChart
          buckets={buckets!}
          highlightBucket={(record as { highlightBucket?: string }).highlightBucket}
        />
      )}
      <dl className="flex flex-col gap-1.5">
        {record.prerequisite && <FieldRow label="Prerequisite" value={record.prerequisite} mono />}
        {record.corequisite && <FieldRow label="Corequisite" value={record.corequisite} mono />}
        {record.terms?.length > 0 && <FieldRow label="Offered" value={record.terms.join(", ")} />}
      </dl>
      {record.sections?.length > 0 && <SectionTable sections={record.sections} />}
    </article>
  );
}

function CourseStatsBand({ record, isRecent }: { record: Record<string, unknown>; isRecent: boolean }) {
  const avg = record.average as number | undefined;
  const reported = record.reported as number | undefined;
  const term = record.term;
  const high = record.high as number | null | undefined;
  const low = record.low as number | null | undefined;
  const weightedMedian = record.weightedMedian as number | null | undefined;
  const mode = record.mode as string | null | undefined;
  const stdDev = record.stdDev as number | null | undefined;
  const p25 = record.p25 as number | null | undefined;
  const p75 = record.p75 as number | null | undefined;

  if (!isRecent) {
    return (
      <div className="grid grid-cols-5 gap-1.5">
        <StatBox label="Average">{avg != null ? `${avg.toFixed(1)}%` : "N/A"}</StatBox>
        <StatBox label="Enrolled">{reported != null ? reported.toLocaleString() : "N/A"}</StatBox>
        <StatBox label="Median">{weightedMedian != null ? `${weightedMedian.toFixed(1)}%` : "N/A"}</StatBox>
        <StatBox label="High">{formatPct(high)}</StatBox>
        <StatBox label="Low">{formatPct(low)}</StatBox>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-5 gap-1.5">
        <StatBox label="Average">{avg != null ? `${avg.toFixed(1)}%` : "N/A"}</StatBox>
        <StatBox label="Term">{getTermLabel(term)}</StatBox>
        <StatBox label="Enrolled">{reported != null ? reported.toLocaleString() : "N/A"}</StatBox>
        <StatBox label="High">{formatPct(high)}</StatBox>
        <StatBox label="Low">{formatPct(low)}</StatBox>
      </div>
      <details className="group">
        <summary className="text-primary cursor-pointer list-none text-right text-xs underline">Advanced Stats</summary>
        <div className="mt-1.5 grid grid-cols-5 gap-1.5">
          <StatBox label="Median">{weightedMedian != null ? `${weightedMedian.toFixed(1)}%` : "N/A"}</StatBox>
          <StatBox label="Mode">{mode ?? "N/A"}</StatBox>
          <StatBox label="Std Dev">{stdDev != null && Number.isFinite(stdDev) ? stdDev.toFixed(1) : "N/A"}</StatBox>
          <StatBox label="25th %ile">{formatPct(p25)}</StatBox>
          <StatBox label="75th %ile">{formatPct(p75)}</StatBox>
        </div>
      </details>
    </div>
  );
}
