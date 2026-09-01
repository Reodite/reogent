import { Icon } from "@/src/components/icons";

/** Renders the planner's shared checkbox geometry. */
export function PlannerCheckboxMark({ checked, disabled = false }: { checked: boolean; disabled?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`peer-focus-visible:ring-primary/40 flex size-9 shrink-0 items-center justify-center rounded-lg peer-focus-visible:ring-2 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <span
        className={`flex size-5 items-center justify-center rounded-md border-2 ${
          checked ? "border-primary bg-primary" : "border-outline"
        }`}
      >
        {checked && <Icon name="check" size={12} className="text-on-primary" />}
      </span>
    </span>
  );
}
