import { Icon, type IconName } from "@/src/components/icons";
import type { ComponentPropsWithRef, ReactNode } from "react";

/** Raised menu frame: a 12px radius around a 4px inset, so 8px-radius items nest concentrically. */
export const MENU_SURFACE_CLASSES = "neu-panel bg-surface grid gap-1 rounded-xl p-1";

const ITEM_CLASSES =
  "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-inset disabled:opacity-45";

const TONE_CLASSES = {
  default: "text-on-surface enabled:hover:bg-surface-container-high focus-visible:ring-primary/40",
  danger: "text-error enabled:hover:bg-error-container/40 focus-visible:ring-error/40",
} as const;

type MenuItemProps = ComponentPropsWithRef<"button"> & {
  icon: IconName;
  tone?: keyof typeof TONE_CLASSES;
  /** Content after the label, such as a lock on an unavailable action. */
  trailing?: ReactNode;
};

/** Renders a 44px native `menuitem` button with a leading 16px icon. */
export function MenuItem({ icon, tone = "default", trailing, className, children, ...props }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`${ITEM_CLASSES} ${TONE_CLASSES[tone]} ${className ?? ""}`}
      {...props}
    >
      <Icon name={icon} size={16} className={tone === "default" ? "text-on-surface-variant" : undefined} />
      {children}
      {trailing ? <span className="text-on-surface-variant ml-auto inline-flex">{trailing}</span> : null}
    </button>
  );
}
