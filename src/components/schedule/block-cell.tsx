"use client";

import type { MergedBlock } from "@/src/lib/schedule/calendar/buildCalendar";
import { courseColor } from "@/src/lib/schedule/calendar/colors";
import { rangeLabel } from "@/src/lib/schedule/util/time";
import { AvatarChip } from "./avatar-chip";

const MAX_CHIPS = 4;

const COMPONENT_ABBREV: Record<string, string> = {
  Lecture: "lec",
  Laboratory: "lab",
  Discussion: "dis",
  Seminar: "sem",
};

export function componentAbbrev(component: string): string {
  return COMPONENT_ABBREV[component] ?? component.slice(0, 3).toLowerCase();
}

/** 'CPSC_V 221' -> 'CPSC 221'; falls back to the title for code-less data */
export function displayCode(section: { courseCode: string; title: string }): string {
  return section.courseCode ? section.courseCode.replace(/_V(?=\s)/, "") : section.title;
}

interface Props {
  block: MergedBlock;
  top: number;
  height: number;
  onClick: (block: MergedBlock) => void;
}

export function BlockCell({ block, top, height, onClick }: Props) {
  const color = courseColor(block.section);
  const compact = height < 62;

  const roomLabel = block.rooms.join("/");
  const loc = block.pattern.buildingCode ? `${block.pattern.buildingCode} ${roomLabel}`.trim() : roomLabel;

  const style = {
    top,
    height: Math.max(height - 2, 18),
    left: `calc(${(100 / block.cols) * block.col}% + 2px)`,
    width: `calc(${100 / block.cols}% - 5px)`,
    zIndex: block.col + 1,
    borderColor: color,
    background: `color-mix(in srgb, ${color} 14%, var(--surface-container-low))`,
  } as React.CSSProperties;

  return (
    <button
      type="button"
      className="focus-visible:ring-primary/40 absolute flex cursor-pointer flex-col gap-0.5 overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left transition-shadow hover:shadow-md focus-visible:ring-2"
      style={style}
      title={`${displayCode(block.section)} — ${block.section.title} (${block.section.component}) · ${rangeLabel(block.startMin, block.endMin)}${loc ? ` · ${loc}` : ""} · ${block.people.map((p) => p.handle).join(", ")}`}
      onClick={() => onClick(block)}
    >
      <span className="text-on-surface truncate text-[11px] leading-tight font-semibold">
        {displayCode(block.section)}{" "}
        <span className="text-on-surface-variant font-normal">{componentAbbrev(block.section.component)}</span>
      </span>
      {!compact && (
        <>
          <span className="text-on-surface-variant truncate text-[11px] leading-tight">
            {rangeLabel(block.startMin, block.endMin)}
          </span>
          {loc && <span className="text-muted truncate text-[11px] leading-tight">{loc}</span>}
        </>
      )}
      <span className="mt-auto flex items-center gap-0.5">
        {block.people.slice(0, MAX_CHIPS).map((p) => (
          <AvatarChip key={p.id} avatar={p.avatar} size={16} title={p.handle} />
        ))}
        {block.people.length > MAX_CHIPS && (
          <span className="text-on-surface-variant text-[10px] font-medium">+{block.people.length - MAX_CHIPS}</span>
        )}
      </span>
    </button>
  );
}
