"use client";

import { Icon } from "@/src/components/icons";

export default function SchedulePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
      <Icon name="calendar" size={32} className="text-muted" />
      <p className="text-muted text-sm font-medium">Coming soon</p>
      <p className="text-on-surface-variant text-center text-sm">
        For now, use ScheduleSharer to build and share your schedule.
      </p>
      <a
        href="https://reodite.github.io/ScheduleSharer/"
        target="_blank"
        rel="noopener noreferrer"
        className="neu-button bg-surface text-on-surface hover:text-primary mt-1 flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium transition-colors"
      >
        <Icon name="calendar" size={16} />
        Open ScheduleSharer
      </a>
    </div>
  );
}
