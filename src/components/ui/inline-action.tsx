import type { ComponentPropsWithRef } from "react";

type InlineActionProps = ComponentPropsWithRef<"button">;

/** Renders a native link-styled action for compact inline recovery choices. */
export function InlineAction({ type = "button", className, ...props }: InlineActionProps) {
  const classes = [
    "focus-visible:ring-primary/40 text-primary inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-1 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-0 sm:min-w-0 sm:rounded-sm sm:px-0",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes} {...props} />;
}
