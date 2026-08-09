import { Icon, type IconName } from "@/src/components/icons";
import type { ReactNode } from "react";

/**
 * Standard card layout for tool results: icon container + content slots + optional action.
 */
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
    <div className="bg-surface-container-low mt-2 flex items-center gap-3 rounded-lg p-3">
      <span className="bg-secondary-container text-on-secondary-container flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

/** Compact pill button for "Show on map" actions. 44px min-height touch target. */
export function MapPill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="border-primary text-primary hover:bg-accent-subtle focus-visible:ring-primary/40 min-h-[44px] shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-[color,background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95"
    >
      Show on map
    </button>
  );
}
