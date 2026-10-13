import type { ComponentPropsWithoutRef, ReactNode } from "react";

type SkeletonProps = Omit<ComponentPropsWithoutRef<"span">, "children" | "aria-hidden">;

/** Renders a decorative placeholder using the shared skeleton material and motion. */
export function Skeleton({ className = "", ...props }: SkeletonProps) {
  return (
    <span
      {...props}
      aria-hidden="true"
      data-skeleton
      className={`skeleton block max-w-full shrink-0 rounded ${className}`}
    />
  );
}

type SkeletonGroupProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  label: string;
  children: ReactNode;
};

/** Announces one loading state while hiding its decorative placeholder content. */
export function SkeletonGroup({ label, children, className = "", ...props }: SkeletonGroupProps) {
  return (
    <div role="status" aria-label={label} className={`min-w-0 ${className}`} {...props}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  );
}

/** Reserves a short text block without adding another loading announcement. */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`flex min-w-0 flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Placeholder positions do not reorder.
        <Skeleton key={index} className={`h-3 ${index === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

const PADDING = { none: "p-0", sm: "p-3", md: "p-4" } as const;

/** Reserves padded result rows for lists, search suggestions, and contextual panels. */
export function SkeletonList({
  label,
  rows = 3,
  icon = false,
  padding = "md",
  className = "",
}: {
  label: string;
  rows?: number;
  icon?: boolean;
  padding?: keyof typeof PADDING;
  className?: string;
}) {
  return (
    <SkeletonGroup label={label} className={`flex flex-col gap-3 ${PADDING[padding]} ${className}`}>
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Placeholder positions do not reorder.
        <div key={index} className="flex min-h-11 min-w-0 items-center gap-3">
          {icon ? <Skeleton className="size-9 rounded-lg" /> : null}
          <SkeletonText lines={2} className="flex-1" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** Reserves labeled form controls inside an existing form or panel. */
export function SkeletonFields({ label, fields = 3 }: { label: string; fields?: number }) {
  return (
    <SkeletonGroup label={label} className="flex flex-col gap-4">
      {Array.from({ length: fields }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Placeholder positions do not reorder.
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
    </SkeletonGroup>
  );
}
