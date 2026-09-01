import type { NeumorphicSurfaceToken } from "@/src/shared/color-tokens";
import type { ComponentPropsWithRef } from "react";

const BASE_CLASSES =
  "focus-visible:ring-primary/40 inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45";

const VARIANT_CLASSES = {
  primary: "neu-primary-button bg-primary text-on-primary",
  secondary: "neu-button bg-surface text-on-surface",
  danger: "neu-button bg-surface text-on-surface-variant enabled:hover:bg-error/10 enabled:hover:text-error",
  ghost: "text-on-surface-variant enabled:hover:bg-surface-container-high enabled:hover:text-on-surface",
} as const;

const SIZE_CLASSES = {
  compact: "h-11 rounded-lg px-3 text-xs sm:h-8",
  toolbar: "h-11 rounded-lg px-3 text-xs sm:h-9",
  default: "h-11 rounded-xl px-4 text-sm sm:h-9",
  prominent: "h-11 rounded-xl px-4 text-sm sm:h-10",
  field: "h-11 rounded-xl px-4 text-sm",
  large: "h-12 rounded-xl px-8 text-base",
  icon: "size-11 rounded-xl p-0 sm:size-9",
} as const;

type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: keyof typeof VARIANT_CLASSES;
  size?: keyof typeof SIZE_CLASSES;
  shadowOn?: NeumorphicSurfaceToken;
};

/** Renders a native button with shared action geometry and material states. */
export function Button({
  type = "button",
  variant = "secondary",
  size = "default",
  shadowOn = "surface",
  className,
  ...props
}: ButtonProps) {
  const classes = [BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], `neu-shadow-on-${shadowOn}`, className]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes} {...props} />;
}
