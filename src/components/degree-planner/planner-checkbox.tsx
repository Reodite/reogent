import { Icon } from "@/src/components/icons";

/** Renders the planner's shared checkbox geometry. */
export function PlannerCheckboxMark({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg">
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
