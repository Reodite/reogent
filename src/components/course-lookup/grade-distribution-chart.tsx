"use client";

import { BUCKET_KEYS, gradeClass, type BucketKey } from "@/src/server/course-records";

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

  const ySteps = 5;
  const labels = Array.from({ length: ySteps + 1 }, (_, i) => Math.round((maxCount * i) / ySteps));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="flex w-8 flex-col justify-between py-1 text-right">
          {[...labels].reverse().map((l, i) => (
            <span
              key={l}
              className="text-muted text-[10px] leading-none"
              style={{ marginTop: i === 0 ? 0 : undefined }}
            >
              {l}
            </span>
          ))}
        </div>
        <div className="relative flex flex-1 items-end gap-1 border-b border-l px-1 pt-2 pb-0">
          {BUCKET_KEYS.map((k) => {
            const count = buckets[k] ?? 0;
            const h = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const isHi = highlightBucket === k;
            return (
              <div key={k} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full items-end justify-center" style={{ height: 96 }}>
                  <div
                    title={`${count} students`}
                    role="img"
                    aria-label={`${k}: ${count} students`}
                    className={`w-full rounded-t transition-colors ${isHi ? "bg-primary" : "bg-primary/70 hover:bg-primary/90"}`}
                    style={{ height: `${h}%`, minHeight: count > 0 ? 4 : 0 }}
                  />
                </div>
                <span className={`text-[10px] leading-none ${isHi ? "text-primary font-semibold" : "text-muted"}`}>
                  {k}
                </span>
              </div>
            );
          })}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between px-1 py-2">
            {labels.map((l) => (
              <div key={`grid-${l}`} className="border-surface-container h-px w-full border-t" />
            ))}
          </div>
        </div>
      </div>
      <p className="text-muted text-center text-[10px]">Grade distribution — {total.toLocaleString()} students</p>
    </div>
  );
}

export function AveragePill({ value, label }: { value: number | null | undefined; label?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-muted text-sm">N/A</span>;
  const cls = gradeClass(value);
  const color =
    cls === "excellent-average"
      ? "text-emerald-600 dark:text-emerald-400"
      : cls === "great-average"
        ? "text-teal-600 dark:text-teal-400"
        : cls === "good-average"
          ? "text-sky-600 dark:text-sky-400"
          : cls === "fair-average"
            ? "text-amber-600 dark:text-amber-400"
            : cls === "bad-average"
              ? "text-orange-600 dark:text-orange-400"
              : "text-red-600 dark:text-red-400";
  return (
    <span className={`font-mono text-sm font-medium ${color}`} title={label}>
      {value.toFixed(1)}%
    </span>
  );
}
