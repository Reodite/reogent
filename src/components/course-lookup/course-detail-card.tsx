"use client";

import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { SectionRow } from "@/src/components/course-lookup/section-row";
import { Icon } from "@/src/components/icons";
import type { CourseDoc, CourseSection } from "@/src/lib/api-types";

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

/** Course Record renderer. Null-or-empty fields are omitted rather than shown as placeholders (REQ-2.2). The Prereq Tree affordance opens the tree pane rooted at this course (REQ-4.1). */
export function CourseDetailCard({ record }: { record: CourseDoc }) {
  const { setActiveChannel } = useChatShell();
  return (
    <article className="bg-surface-container-low flex flex-col gap-2.5 rounded-lg p-3">
      <header className="flex flex-wrap items-baseline gap-1.5">
        <h3 className="font-mono text-base leading-tight font-medium">{record.code}</h3>
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
      <dl className="flex flex-col gap-1.5">
        {record.prerequisite && <FieldRow label="Prerequisite" value={record.prerequisite} mono />}
        {record.corequisite && <FieldRow label="Corequisite" value={record.corequisite} mono />}
        {record.terms?.length > 0 && <FieldRow label="Offered" value={record.terms.join(", ")} />}
      </dl>
      {record.sections?.length > 0 && <SectionTable sections={record.sections} />}
    </article>
  );
}
