import type { ComponentPropsWithoutRef } from "react";

const EMPHASIS_CLASSES = {
  subtle: "bg-surface-container text-on-surface-variant",
  strong: "bg-surface-container-high text-on-surface-variant font-medium",
} as const;

/** Renders compact, noninteractive factual metadata. */
export function InfoChip({
  emphasis = "subtle",
  className,
  ...props
}: ComponentPropsWithoutRef<"span"> & { emphasis?: keyof typeof EMPHASIS_CLASSES }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${EMPHASIS_CLASSES[emphasis]} ${className ?? ""}`}
      {...props}
    />
  );
}
