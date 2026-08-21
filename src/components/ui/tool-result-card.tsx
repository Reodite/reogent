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
    <div className="bg-surface-container-low flex items-center gap-3 rounded-lg p-3">
      <span className="bg-secondary-container text-on-secondary-container flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}
