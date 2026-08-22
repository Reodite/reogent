"use client";

import { BUCKET_KEYS, gradeClass } from "@/src/server/course-records";

const PLOT_HEIGHT = 112;
const Y_STEPS = 5;

/**
 * Average-band text color from the committed token set: verdant for strong
 * results, bark as caution, error for weak. `gradeClass` supplies the band;
 * its names carry no CSS on their own.
 */
export function averageColorClass(value: number): string {
  const cls = gradeClass(value);
  if (cls === "excellent-average" || cls === "great-average" || cls === "good-average") return "text-secondary";
  if (cls === "fair-average") return "text-tertiary";
  if (cls === "bad-average") return "text-error";
  return "text-error";
}

export function GradeDistributionChart({
  buckets,
  highlightBucket,
}: {
  buckets: Record<string, number>;
  highlightBucket?: string;
}) {
  const counts = BUCKET_KEYS.map((k) => buckets[k] ?? 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...counts, 0);
  if (total === 0) return <p className="text-muted py-6 text-center text-sm">No distribution data available.</p>;

  // Bottom-up values 0…maxCount, plotted with 0 on the baseline (the border-b)
  // and maxCount at the top so the axis matches the bottom-anchored bars.
  const yTicks = Array.from({ length: Y_STEPS + 1 }, (_, i) => ({
    v: Math.round((maxCount * i) / Y_STEPS),
    top: `${(1 - i / Y_STEPS) * 100}%`,
    id: `y-${i}`,
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div aria-hidden="true" className="relative w-9 shrink-0" style={{ height: PLOT_HEIGHT }}>
          {yTicks.map((t) => (
            <span
              key={t.id}
              className="text-muted absolute right-0 -translate-y-1/2 text-xs leading-none"
              style={{ top: t.top }}
            >
              {t.v}
            </span>
          ))}
        </div>
        <div className="border-surface-container min-w-0 flex-1 border-b border-l pl-1">
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            {/* Gridlines render first so the z-10 bar layer stacks above them. */}
            <div
              data-chart-grid
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex flex-col justify-between"
            >
              {yTicks.slice(1).map((t) => (
                <div key={`grid-${t.id}`} className="border-surface-container h-px w-full border-t" />
              ))}
            </div>
            <div data-chart-bars className="relative z-10 flex h-full items-end gap-1.5">
              {BUCKET_KEYS.map((k) => {
                const count = buckets[k] ?? 0;
                const h = maxCount > 0 ? (count / maxCount) * 100 : 0;
                const isHi = highlightBucket === k;
                return (
                  <div key={k} className="flex h-full min-w-0 flex-1 items-end">
                    <div
                      title={`${count} students`}
                      role="img"
                      aria-label={`${k}: ${count} students`}
                      className={`w-full rounded-t-sm transition-colors ${
                        isHi ? "bg-primary" : "bg-primary/25 hover:bg-primary/40"
                      }`}
                      style={{ height: `${h}%`, minHeight: count > 0 ? 4 : 0 }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-1.5 flex h-10 gap-1.5 pl-0.5">
            {BUCKET_KEYS.map((k) => {
              const isHi = highlightBucket === k;
              return (
                <span key={k} className="min-w-0 flex-1">
                  <span
                    className={`inline-block origin-top-left rotate-45 text-xs leading-none whitespace-nowrap ${
                      isHi ? "text-primary font-medium" : "text-muted"
                    }`}
                  >
                    {k}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <p className="text-muted text-center text-xs">Grade distribution — {total.toLocaleString()} students</p>
    </div>
  );
}

export function AveragePill({ value, label }: { value: number | null | undefined; label?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-muted text-sm">N/A</span>;
  return (
    <span className={`font-mono text-sm font-medium ${averageColorClass(value)}`} title={label}>
      {value.toFixed(1)}%
    </span>
  );
}
