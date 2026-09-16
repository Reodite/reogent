import type { ComponentPropsWithoutRef } from "react";

const EMPHASIS_CLASSES = {
  subtle: "bg-surface-container text-on-surface-variant",
  strong: "bg-surface-container-high text-on-surface-variant font-medium",
} as const;

const STATUS_CLASSES = {
  caution: "bg-tertiary-container text-on-tertiary-container font-medium",
  error: "bg-error-container text-on-error-container font-medium",
} as const;

/** Renders noninteractive metadata or status. Emphasis changes neutral chips only. */
export function InfoChip({
  emphasis = "subtle",
  tone = "neutral",
  className,
  ...props
}: ComponentPropsWithoutRef<"span"> & {
  emphasis?: keyof typeof EMPHASIS_CLASSES;
  tone?: "neutral" | keyof typeof STATUS_CLASSES;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-4 ${tone === "neutral" ? EMPHASIS_CLASSES[emphasis] : STATUS_CLASSES[tone]} ${className ?? ""}`}
      {...props}
    />
  );
}
