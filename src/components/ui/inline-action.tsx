import Link from "next/link";
import type { ComponentPropsWithRef } from "react";

const INLINE_CLASSES =
  "focus-visible:ring-primary/40 text-primary inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-1 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none sm:min-h-0 sm:min-w-0 sm:rounded-sm sm:px-0";

/** Renders a native link-styled button for compact inline choices. */
export function InlineAction({ type = "button", className, ...props }: ComponentPropsWithRef<"button">) {
  return <button type={type} className={`${INLINE_CLASSES} disabled:opacity-45 ${className ?? ""}`} {...props} />;
}

/** Renders a Next.js link with the shared inline action hit area. */
export function InlineLink({ className, ...props }: ComponentPropsWithRef<typeof Link>) {
  return <Link className={`${INLINE_CLASSES} ${className ?? ""}`} {...props} />;
}
