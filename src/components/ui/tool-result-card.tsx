import { Icon, type IconName } from "@/src/components/icons";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/** Standard card layout for an icon, result content, and optional action. */
export function ToolResultCard({
  icon,
  children,
  action,
}: {
  icon: IconName;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="bg-surface-container-low flex items-center gap-3 rounded-lg p-3">
      <span className="bg-secondary-container text-on-secondary-container flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

interface ToolResultListProps extends ComponentPropsWithoutRef<"div"> {
  header?: ReactNode;
  footer?: ReactNode;
}

/** Frames repeated tool-result rows with one surface and divider contract. */
export function ToolResultList({ header, footer, children, className, ...props }: ToolResultListProps) {
  return (
    <div className={`bg-surface-container-low flex flex-col overflow-hidden rounded-lg ${className ?? ""}`} {...props}>
      {header ? <div className="text-muted border-border-subtle border-b px-3 py-2 text-xs">{header}</div> : null}
      {children}
      {footer ? <div className="text-muted border-border-subtle border-t px-3 py-2 text-xs">{footer}</div> : null}
    </div>
  );
}

/** Returns consistent row geometry while preserving native button, link, or div semantics. */
export function toolResultRowClasses(interactive = false): string {
  return [
    "border-border-subtle flex min-h-11 w-full items-center justify-between gap-3 border-b px-3 py-2.5 last:border-b-0",
    interactive
      ? "hover:bg-surface-container-high focus-visible:ring-primary/40 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

interface ToolResultRowContentProps {
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  titleClassName?: string;
}

/** Renders the shared title, description, and trailing metadata anatomy for result rows. */
export function ToolResultRowContent({ title, description, trailing, titleClassName }: ToolResultRowContentProps) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-on-surface truncate text-sm font-medium ${titleClassName ?? ""}`}>{title}</span>
        {description ? <span className="text-muted truncate text-xs">{description}</span> : null}
      </span>
      {trailing}
    </>
  );
}

function safeResultText(result: unknown): string {
  try {
    const text = JSON.stringify(result, null, 2);
    return text ?? String(result);
  } catch {
    return "Result details are unavailable.";
  }
}

/** Keeps tool evidence visible when a rich renderer fails. */
export function ToolResultFailure({ name, result }: { name: string; result: unknown }) {
  return (
    <div role="alert" className="border-error/30 bg-error-container/40 text-on-error-container rounded-lg border p-3">
      <p className="text-sm font-medium">This {name.replaceAll("_", " ")} result couldn't be displayed.</p>
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer text-xs font-medium">View raw result</summary>
        <pre className="bg-surface-container-low text-on-surface mt-1 max-h-40 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
          {safeResultText(result)}
        </pre>
      </details>
    </div>
  );
}
