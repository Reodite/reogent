"use client";

import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { scheduleToIcs } from "@/src/lib/schedule/features/ics";
import { buildingTransfers } from "@/src/lib/schedule/features/transfers";
import type { Schedule, Section } from "@/src/lib/schedule/types";
import { minutesToFullLabel } from "@/src/lib/schedule/util/time";
import { useEffect, useMemo, useState } from "react";

interface Walk {
  minutes: number;
  method: "network" | "estimate";
}

function pairKey(from: string, to: string): string {
  return `${from}|${to}`;
}

function downloadIcs(schedule: Schedule) {
  const url = URL.createObjectURL(new Blob([scheduleToIcs(schedule)], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "reodite-schedule.ics";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Calendar export for the viewer's whole schedule, plus warnings for
 * back-to-back classes in `sections` whose walking time meets or exceeds the
 * gap between them. Pairs whose route request fails stay unflagged.
 */
export function MyScheduleTools({ schedule, sections }: { schedule: Schedule; sections: Section[] }) {
  const transfers = useMemo(() => buildingTransfers(sections), [sections]);
  // A string dependency keeps re-renders with equal transfers from refetching routes.
  const pairs = [
    ...new Set(transfers.map((t) => pairKey(t.from.pattern.buildingCode ?? "", t.to.pattern.buildingCode ?? ""))),
  ].join(",");
  const [walks, setWalks] = useState<Map<string, Walk> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setWalks(null);
    Promise.all(
      (pairs ? pairs.split(",") : []).map(async (key) => {
        const [from, to] = key.split("|");
        try {
          const response = await fetch(`/api/route?${new URLSearchParams({ from, to })}`, {
            signal: controller.signal,
          });
          if (!response.ok) return null;
          const body = (await response.json()) as Walk;
          return [key, { minutes: body.minutes, method: body.method }] as const;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (!controller.signal.aborted) setWalks(new Map(results.filter((r) => r !== null)));
    });
    return () => controller.abort();
  }, [pairs]);

  const tight = walks
    ? transfers.flatMap((t) => {
        const walk = walks.get(pairKey(t.from.pattern.buildingCode ?? "", t.to.pattern.buildingCode ?? ""));
        return walk && walk.minutes >= t.gapMin ? [{ ...t, walk }] : [];
      })
    : [];

  return (
    <div className="mt-3 flex flex-col gap-3">
      <Button size="field" className="w-full" onClick={() => downloadIcs(schedule)}>
        <Icon name="calendar" size={16} />
        Export to calendar (.ics)
      </Button>
      {tight.length > 0 ? (
        <section aria-label="Tight transfers" className="bg-surface-container-low rounded-lg px-2.5 py-2">
          <p className="text-on-surface flex items-center gap-1.5 text-xs font-medium">
            <Icon name="walk" size={14} />
            Tight transfers
          </p>
          <ul className="text-on-surface-variant mt-1 flex flex-col gap-1.5 text-xs leading-5">
            {tight.map((t) => (
              <li key={`${t.day}-${t.from.section.id}-${t.to.section.id}-${t.to.pattern.startMin}`}>
                <span className="text-on-surface">
                  {t.day} {minutesToFullLabel(t.from.pattern.endMin)}
                </span>{" "}
                {t.from.pattern.buildingCode} to {t.to.pattern.buildingCode}:{" "}
                {t.walk.method === "estimate" ? "about " : ""}
                {t.walk.minutes} min walk, {t.gapMin} min gap
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
