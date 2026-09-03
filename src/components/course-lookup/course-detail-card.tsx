"use client";

import { GradeDistributionChart } from "@/src/components/course-lookup/grade-distribution-chart";
import { SectionRow } from "@/src/components/course-lookup/section-row";
import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { InfoChip } from "@/src/components/ui/info-chip";
import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import { useId } from "react";

function FieldRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted text-xs font-medium tracking-[0.05em] uppercase">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>{value}</dd>
    </div>
  );
}

function SectionTable({ sections }: { sections: CourseSection[] }) {
  const headingId = useId();
  const groups = new Map<string, CourseSection[]>();
  for (const section of sections) {
    const term = section.term?.trim() || "Other sections";
    const group = groups.get(term);
    if (group) group.push(section);
    else groups.set(term, [section]);
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-on-surface text-sm font-medium">
        Sections
      </h3>
      {[...groups].map(([term, termSections]) => (
        <details key={term} className="border-border-subtle bg-surface-container-low rounded-lg border">
          <summary className="text-on-surface flex min-h-11 items-center justify-between gap-3 px-3 text-sm font-medium">
            <span className="min-w-0 truncate">{term}</span>
            <span className="text-muted shrink-0 text-xs whitespace-nowrap tabular-nums">
              {termSections.length} section{termSections.length === 1 ? "" : "s"}
            </span>
          </summary>
          <div className="border-border-subtle overflow-x-auto border-t px-3">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">{term} course sections</caption>
              <thead className="sr-only">
                <tr>
                  <th>Term</th>
                  <th>Days</th>
                  <th>Time</th>
                  <th>Instructor</th>
                </tr>
              </thead>
              <tbody>
                {termSections.map((section) => (
                  <SectionRow key={`${section.section}-${section.term ?? ""}`} section={section} />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </section>
  );
}

function formatPct(v: unknown): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return `${Math.round(v)}%`;
}

function StatBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="neu-inset bg-surface-container-low flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-2 py-2">
      <span className="text-muted text-xs font-medium tracking-[0.05em] uppercase">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

/** Stat well that renders only when the value exists — dead "N/A" cells are omitted (REQ-2.2). */
function DefinedStat({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null) return null;
  return <StatBox label={label}>{value}</StatBox>;
}

/** Course Record renderer. Null-or-empty fields are omitted rather than shown as placeholders (REQ-2.2). The Prereq Tree affordance opens the tree pane rooted at this course (REQ-4.1). */
export function CourseDetailCard({
  record,
  session,
  onOpenPrereqs,
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
  onOpenPrereqs?: (code: string) => void;
}) {
  const sess = (session ?? (record as { session?: string }).session) as string | undefined;
  const isRecent = sess ? ["2024W", "2024S", "2025W", "2025S"].includes(sess) : false;
  const buckets = (record as { buckets?: Record<string, number> }).buckets;
  const hasDistribution = buckets != null;
  return (
    <article className="neu-panel bg-surface flex flex-col gap-3 rounded-xl p-4">
      <header className="flex flex-wrap items-baseline gap-1.5">
        {/* Catalog codes carry a _V campus suffix after the subject; display strips it. */}
        <h2 className="font-mono text-base leading-tight font-medium">{record.code.replace(/_V(?=\b|$)/, "")}</h2>
        {sess ? <InfoChip>{sess}</InfoChip> : null}
        {record.credits != null ? <InfoChip>{record.credits} cr</InfoChip> : null}
        {record.prerequisite && onOpenPrereqs ? (
          <Button
            data-action="open-prereq-tree"
            data-code={record.code}
            variant="outline"
            size="pill"
            onClick={() => onOpenPrereqs(record.code)}
          >
            <Icon name="tree" size={14} /> Prereq Tree
          </Button>
        ) : null}
      </header>
      <p className="text-sm font-medium">{record.title}</p>
      {record.description && <p className="text-on-surface-variant text-sm leading-relaxed">{record.description}</p>}
      {hasDistribution && <CourseStatsBand record={record as unknown as Record<string, unknown>} isRecent={isRecent} />}
      {buckets ? (
        <GradeDistributionChart
          buckets={buckets}
          highlightBucket={(record as { highlightBucket?: string }).highlightBucket}
        />
      ) : null}
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
  const high = record.high as number | null | undefined;
  const low = record.low as number | null | undefined;
  const weightedMedian = record.weightedMedian as number | null | undefined;
  const mode = record.mode as string | null | undefined;
  const stdDev = record.stdDev as number | null | undefined;
  const p25 = record.p25 as number | null | undefined;
  const p75 = record.p75 as number | null | undefined;

  // TERM is dropped: session already shows in the header chip and the field is
  // absent from per-session records.
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <DefinedStat label="Average" value={avg != null ? `${avg.toFixed(1)}%` : null} />
        <DefinedStat label="Enrolled" value={reported != null ? reported.toLocaleString() : null} />
        <DefinedStat label="High" value={formatPct(high)} />
        <DefinedStat label="Low" value={formatPct(low)} />
      </div>
      {isRecent && (
        <details className="group rounded-lg">
          <summary className="text-on-surface-variant hover:text-on-surface flex min-h-[44px] list-none items-center justify-end gap-1 text-xs font-medium [&::-webkit-details-marker]:hidden">
            Advanced stats
            <Icon name="down" size={14} className="transition-transform duration-150 group-open:rotate-180" />
          </summary>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            <DefinedStat label="Median" value={weightedMedian != null ? `${weightedMedian.toFixed(1)}%` : null} />
            <DefinedStat label="Mode" value={mode ?? null} />
            <DefinedStat label="Std Dev" value={stdDev != null && Number.isFinite(stdDev) ? stdDev.toFixed(1) : null} />
            <DefinedStat label="25th %ile" value={formatPct(p25)} />
            <DefinedStat label="75th %ile" value={formatPct(p75)} />
          </div>
        </details>
      )}
    </div>
  );
}
