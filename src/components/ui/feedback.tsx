import { Icon, type IconName } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { InlineAction } from "@/src/components/ui/inline-action";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

const ALERT_VARIANT_CLASSES = {
  solid: "bg-error-container text-on-error-container",
  soft: "bg-error-container/30 text-error",
} as const;

type RetryAlertProps = Omit<ComponentPropsWithoutRef<"p">, "children"> & {
  children: ReactNode;
  onRetry?: () => void;
  variant?: keyof typeof ALERT_VARIANT_CLASSES;
};

/** Renders a compact load-failure callout with an optional inline retry action. */
export function RetryAlert({ children, onRetry, variant = "solid", className, ...props }: RetryAlertProps) {
  const classes = ["border-error/30 rounded-lg border px-3 py-2 text-sm", ALERT_VARIANT_CLASSES[variant], className]
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

type LoadingStatusProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  children: ReactNode;
  size?: "sm" | "md";
  announce?: boolean;
};

/** Renders a current-color spinner and one consistently announced loading label. */
export function LoadingStatus({ children, size = "sm", announce = true, className, ...props }: LoadingStatusProps) {
  const spinnerSize = size === "sm" ? "size-3" : "size-4";
  return (
    <div
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
      className={`text-muted flex items-center gap-2 text-sm ${className ?? ""}`}
      {...props}
    >
      <span
        aria-hidden="true"
        className={`${spinnerSize} shrink-0 animate-spin rounded-full border-2 border-t-transparent`}
      />
      <span>{children}</span>
    </div>
  );
}

type RetryStateProps = Omit<ComponentPropsWithoutRef<"div">, "children" | "title"> & {
  title?: ReactNode;
  message: ReactNode;
  icon?: IconName;
  onRetry: () => void;
  retryLabel?: string;
  align?: "start" | "center";
  compact?: boolean;
  secondaryAction?: ReactNode;
  children?: ReactNode;
};

/** Renders a stacked recovery state for failed panels and canvases. */
export function RetryState({
  title,
  message,
  icon = "alert",
  onRetry,
  retryLabel = "Try again",
  align = "center",
  compact = false,
  secondaryAction,
  children,
  className,
  ...props
}: RetryStateProps) {
  const centered = align === "center";
  return (
    <div
      role="alert"
      className={`flex flex-col gap-3 ${centered ? "items-center text-center" : "items-start text-left"} ${className ?? ""}`}
      {...props}
    >
      <span
        aria-hidden="true"
        className={`bg-error-container text-error flex items-center justify-center rounded-xl ${compact ? "size-10" : "size-12"}`}
      >
        <Icon name={icon} size={compact ? 20 : 24} />
      </span>
      <div className="min-w-0">
        {title ? <p className="text-on-surface text-base font-medium">{title}</p> : null}
        <p className={`text-on-surface-variant text-sm ${title ? "mt-1" : ""}`}>{message}</p>
      </div>
      <div className={`flex flex-wrap gap-2 ${centered ? "justify-center" : "justify-start"}`}>
        <Button size={compact ? "compact" : "default"} onClick={onRetry}>
          <Icon name="refresh2" size={14} />
          {retryLabel}
        </Button>
        {secondaryAction}
      </div>
      {children}
    </div>
  );
}
