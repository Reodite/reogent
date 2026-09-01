import type { NeumorphicSurfaceToken } from "@/src/shared/color-tokens";
import type { ComponentPropsWithRef } from "react";

const BASE_CLASSES =
  "neu-inset bg-surface-container-low text-on-surface placeholder:text-muted focus-visible:ring-primary/40 rounded-lg focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none aria-[invalid=true]:ring-error/30 aria-[invalid=true]:ring-2 disabled:cursor-not-allowed disabled:opacity-55";

const SIZE_CLASSES = {
  compact: "h-11 text-xs sm:h-9",
  default: "h-11 text-sm",
} as const;

const PADDING_CLASSES = {
  compact: {
    none: "px-2.5",
    start: "pr-2.5 pl-9",
    both: "pr-9 pl-9",
  },
  default: {
    none: "px-3",
    start: "pr-3 pl-9",
    both: "pr-9 pl-9",
  },
} as const;

const WIDTH_CLASSES = {
  auto: "w-auto",
  full: "w-full",
} as const;

type SharedControlProps = {
  controlSize?: keyof typeof SIZE_CLASSES;
  shadowOn?: NeumorphicSurfaceToken;
  width?: keyof typeof WIDTH_CLASSES;
};

type TextInputProps = ComponentPropsWithRef<"input"> &
  SharedControlProps & {
    adornment?: keyof (typeof PADDING_CLASSES)["default"];
  };
type SelectInputProps = ComponentPropsWithRef<"select"> & SharedControlProps;

function controlClasses(
  controlSize: keyof typeof SIZE_CLASSES,
  shadowOn: NeumorphicSurfaceToken,
  width: keyof typeof WIDTH_CLASSES,
  padding: string,
  className: string | undefined,
): string {
  return [
    BASE_CLASSES,
    SIZE_CLASSES[controlSize],
    WIDTH_CLASSES[width],
    padding,
    `neu-shadow-on-${shadowOn}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Renders a native input with the shared inset field treatment. */
export function TextInput({
  controlSize = "default",
  shadowOn = "surface",
  width = "full",
  adornment = "none",
  className,
  ...props
}: TextInputProps) {
  return (
    <input
      className={controlClasses(controlSize, shadowOn, width, PADDING_CLASSES[controlSize][adornment], className)}
      {...props}
    />
  );
}

/** Renders a native select with the shared inset field treatment. */
export function SelectInput({
  controlSize = "default",
  shadowOn = "surface",
  width = "full",
  className,
  ...props
}: SelectInputProps) {
  return (
    <select
      className={controlClasses(controlSize, shadowOn, width, PADDING_CLASSES[controlSize].none, className)}
      {...props}
    />
  );
}
