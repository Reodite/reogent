import type { ComponentPropsWithRef } from "react";

const SIZE_CLASSES = {
  title: "text-xl leading-tight tracking-[-0.02em]",
  section: "text-base leading-6 tracking-[-0.01em]",
  subsection: "text-sm leading-5",
  label: "text-xs leading-4",
} as const;

type HeadingProps = ComponentPropsWithRef<"h2"> & {
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  size?: keyof typeof SIZE_CLASSES;
  tone?: "default" | "muted";
};

/** Renders a native heading with a shared type role independent of its document level. */
export function Heading({ as: Tag = "h2", size = "section", tone = "default", className, ...props }: HeadingProps) {
  return (
    <Tag
      className={`font-medium ${tone === "muted" ? "text-muted" : "text-on-surface"} ${SIZE_CLASSES[size]} ${className ?? ""}`}
      {...props}
    />
  );
}
