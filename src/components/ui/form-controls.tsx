import type { NeumorphicSurfaceToken } from "@/src/shared/color-tokens";
import type { ComponentPropsWithRef } from "react";

const BASE_CLASSES =
  "neu-inset bg-surface-container-low text-on-surface placeholder:text-muted focus-visible:ring-primary/40 w-full rounded-lg px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none aria-[invalid=true]:ring-error/30 aria-[invalid=true]:ring-2 disabled:cursor-not-allowed disabled:opacity-55";

const SIZE_CLASSES = {
  compact: "h-11 sm:h-9",
  default: "h-11",
} as const;

type SharedControlProps = {
  controlSize?: keyof typeof SIZE_CLASSES;
  shadowOn?: NeumorphicSurfaceToken;
};

type TextInputProps = ComponentPropsWithRef<"input"> & SharedControlProps;
type SelectInputProps = ComponentPropsWithRef<"select"> & SharedControlProps;

function controlClasses(
  controlSize: keyof typeof SIZE_CLASSES,
  shadowOn: NeumorphicSurfaceToken,
  className: string | undefined,
): string {
  return [BASE_CLASSES, SIZE_CLASSES[controlSize], `neu-shadow-on-${shadowOn}`, className].filter(Boolean).join(" ");
}

/** Renders a native input with the shared inset field treatment. */
export function TextInput({ controlSize = "default", shadowOn = "surface", className, ...props }: TextInputProps) {
  return <input className={controlClasses(controlSize, shadowOn, className)} {...props} />;
}

/** Renders a native select with the shared inset field treatment. */
export function SelectInput({ controlSize = "default", shadowOn = "surface", className, ...props }: SelectInputProps) {
  return <select className={controlClasses(controlSize, shadowOn, className)} {...props} />;
}
