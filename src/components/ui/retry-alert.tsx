import { InlineAction } from "@/src/components/ui/inline-action";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

const VARIANT_CLASSES = {
  solid: "bg-error-container text-on-error-container",
  soft: "bg-error-container/30 text-error",
} as const;

type RetryAlertProps = Omit<ComponentPropsWithoutRef<"p">, "children"> & {
  children: ReactNode;
  onRetry?: () => void;
  variant?: keyof typeof VARIANT_CLASSES;
};

/** Renders a load-failure callout with an optional inline retry action. */
export function RetryAlert({ children, onRetry, variant = "solid", className, ...props }: RetryAlertProps) {
  const classes = ["border-error/30 rounded-lg border px-3 py-2 text-sm", VARIANT_CLASSES[variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <p role="alert" className={classes} {...props}>
      {children}
      {onRetry ? (
        <>
          {" "}
          <InlineAction onClick={onRetry}>Retry</InlineAction>
        </>
      ) : null}
    </p>
  );
}
