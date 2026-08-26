"use client";

import { Icon } from "@/src/components/icons";

export default function SchedulePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
      <Icon name="calendar" size={32} className="text-muted" />
      <p className="text-muted text-sm font-medium">Coming soon</p>
    </div>
  );
}
