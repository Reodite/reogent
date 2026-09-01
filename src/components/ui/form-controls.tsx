import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import type { NeumorphicSurfaceToken } from "@/src/shared/color-tokens";
import type { ComponentPropsWithoutRef, ComponentPropsWithRef, ReactNode } from "react";

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
    both: "pr-12 pl-9",
  },
  default: {
    none: "px-3",
    start: "pr-3 pl-9",
    both: "pr-12 pl-9",
  },
} as const;

const WIDTH_CLASSES = {
  auto: "w-auto",
  full: "w-full",
} as const;

export type ControlSize = keyof typeof SIZE_CLASSES;
export type SearchDensity = "primary" | "rail";

type SharedControlProps = {
  controlSize?: ControlSize;
  shadowOn?: NeumorphicSurfaceToken;
  width?: keyof typeof WIDTH_CLASSES;
};

export type TextInputProps = ComponentPropsWithRef<"input"> &
  SharedControlProps & {
    adornment?: keyof (typeof PADDING_CLASSES)["default"];
  };
export type SelectInputProps = ComponentPropsWithRef<"select"> & SharedControlProps;

function controlClasses(
  controlSize: ControlSize,
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

export type FieldProps = ComponentPropsWithoutRef<"div"> & {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
};

/** Groups a visible label, native control, and optional help or error text. */
export function Field({ label, htmlFor, hint, error, children, className, ...props }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`} {...props}>
      <label htmlFor={htmlFor} className="text-on-surface-variant text-xs font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-error text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-muted text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type SearchInputProps = Omit<TextInputProps, "adornment" | "controlSize"> & {
  density?: SearchDensity;
  clearLabel?: string;
  onClear?: () => void;
  wrapperClassName?: string;
};

/** Composes TextInput with shared search and clear affordances. */
export function SearchInput({
  density = "primary",
  clearLabel = "Clear search",
  onClear,
  wrapperClassName,
  value,
  ...props
}: SearchInputProps) {
  const hasValue = typeof value === "string" && value.length > 0;
  const showClear = hasValue && onClear !== undefined;
  const controlSize = density === "rail" ? "compact" : "default";

  return (
    <div className={`relative ${wrapperClassName ?? ""}`}>
      <Icon
        name="search"
        className="text-on-surface-variant pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <TextInput value={value} controlSize={controlSize} adornment={showClear ? "both" : "start"} {...props} />
      {showClear ? (
        <Button
          variant="ghost"
          size={density === "rail" ? "denseIcon" : "fieldIcon"}
          onPointerDown={(event) => event.preventDefault()}
          onClick={onClear}
          aria-label={clearLabel}
          className="absolute top-1/2 right-0 -translate-y-1/2"
        >
          <Icon name="close" className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

export type CheckboxProps = Omit<ComponentPropsWithRef<"input">, "type"> & {
  label?: string;
};

/** Renders a native checkbox with one shared visual indicator and focus state. */
export function Checkbox({ className, label, ...props }: CheckboxProps) {
  return (
    <span className={`relative flex size-9 shrink-0 items-center justify-center ${className ?? ""}`}>
      <input
        type="checkbox"
        aria-label={label}
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden="true"
        className="border-outline peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-primary/40 flex size-5 items-center justify-center rounded-md border-2 peer-focus-visible:ring-2 peer-disabled:opacity-50 peer-checked:[&>svg]:opacity-100"
      >
        <Icon name="check" size={12} className="text-on-primary opacity-0" />
      </span>
    </span>
  );
}

/** Renders the checkbox indicator inside specialized non-checkbox controls. */
export function CheckboxMark({ checked, disabled = false }: { checked: boolean; disabled?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${disabled ? "opacity-50" : ""}`}
    >
      <span
        className={`flex size-5 items-center justify-center rounded-md border-2 ${
          checked ? "border-primary bg-primary" : "border-outline"
        }`}
      >
        {checked ? <Icon name="check" size={12} className="text-on-primary" /> : null}
      </span>
    </span>
  );
}
