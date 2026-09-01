import type { NeumorphicSurfaceToken } from "@/src/shared/color-tokens";
import Link from "next/link";
import type { ComponentPropsWithRef } from "react";

const BASE_CLASSES =
  "focus-visible:ring-primary/40 inline-flex shrink-0 items-center justify-center gap-1.5 font-medium transition-[color,background-color,box-shadow,filter,transform] duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none";

const BUTTON_VARIANT_CLASSES = {
  primary: "neu-primary-button bg-primary text-on-primary",
  secondary: "neu-button bg-surface text-on-surface",
  danger: "neu-button bg-surface text-on-surface-variant enabled:hover:bg-error/10 enabled:hover:text-error",
  ghost: "text-on-surface-variant enabled:hover:bg-surface-container-high enabled:hover:text-on-surface",
  outline:
    "border-primary text-primary enabled:hover:bg-accent-subtle active:scale-95 rounded-full border active:transition-transform",
} as const;

const LINK_VARIANT_CLASSES = {
  primary: "neu-primary-button bg-primary text-on-primary",
  secondary: "neu-button bg-surface text-on-surface",
  danger: "neu-button bg-surface text-on-surface-variant hover:bg-error/10 hover:text-error",
  ghost: "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
  outline: "border-primary text-primary hover:bg-accent-subtle active:scale-95 rounded-full border",
} as const;

const SIZE_CLASSES = {
  compact: "h-11 rounded-lg px-3 text-xs sm:h-8",
  toolbar: "h-11 rounded-lg px-3 text-xs sm:h-9",
  default: "h-11 rounded-xl px-4 text-sm sm:h-9",
  prominent: "h-11 rounded-xl px-4 text-sm sm:h-10",
  field: "h-11 rounded-xl px-4 text-sm",
  large: "h-12 rounded-xl px-8 text-base",
  icon: "size-11 rounded-xl p-0 sm:size-9",
  denseIcon: "size-11 rounded-lg p-0 sm:size-8",
  fieldIcon: "size-11 rounded-lg p-0",
  pill: "min-h-11 rounded-full px-3 py-1.5 text-xs sm:min-h-8",
} as const;

type ButtonVariant = keyof typeof BUTTON_VARIANT_CLASSES;
type ButtonSize = keyof typeof SIZE_CLASSES;

type SharedButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shadowOn?: NeumorphicSurfaceToken;
  wrap?: boolean;
};

export type ButtonProps = ComponentPropsWithRef<"button"> & SharedButtonProps;
export type ButtonLinkProps = ComponentPropsWithRef<typeof Link> & SharedButtonProps;

function buttonClasses({
  variant,
  size,
  shadowOn,
  wrap,
  className,
  link,
}: Required<Pick<SharedButtonProps, "variant" | "size" | "shadowOn" | "wrap">> & {
  className?: string;
  link: boolean;
}): string {
  return [
    BASE_CLASSES,
    link ? LINK_VARIANT_CLASSES[variant] : BUTTON_VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    `neu-shadow-on-${shadowOn}`,
    wrap ? "whitespace-normal" : "whitespace-nowrap",
    link ? null : "disabled:cursor-not-allowed disabled:opacity-45",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Renders a native button with shared action geometry and material states. */
export function Button({
  type = "button",
  variant = "secondary",
  size = "default",
  shadowOn = "surface",
  wrap = false,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, shadowOn, wrap, className, link: false })}
      {...props}
    />
  );
}

/** Renders a Next.js link with the same geometry and material as Button. */
export function ButtonLink({
  variant = "secondary",
  size = "default",
  shadowOn = "surface",
  wrap = false,
  className,
  ...props
}: ButtonLinkProps) {
  return <Link className={buttonClasses({ variant, size, shadowOn, wrap, className, link: true })} {...props} />;
}
