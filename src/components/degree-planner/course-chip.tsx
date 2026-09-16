"use client";

import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { Disclosure } from "@/src/components/ui/disclosure";
import { parsePrereq } from "@/src/shared/prereq-ast";
import type { DraggableSyntheticListeners } from "@dnd-kit/core";
import { AnimatePresence } from "motion/react";
import { useId, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import { CourseInfoPopup } from "./course-info-popup";
import { CoursePlacementSelect } from "./course-placement-select";
import { forwardPlannerDragActivator } from "./drag-activator";
import { usePlanner } from "./planner-store";
import type { BlockValidation } from "./validation";

interface CourseChipProps {
  code: string;
  entry: CourseIndexEntry | undefined;
  blockId?: string;
  validation?: BlockValidation;
  ghost?: boolean;
  onPlaced?: () => void;
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  listeners?: DraggableSyntheticListeners;
}

/** Renders compact course text and available actions, preserving each source layout during dragging. */
export function CourseChip({
  code,
  entry,
  blockId,
  validation,
  ghost = false,
  onPlaced,
  ref,
  style,
  listeners,
}: CourseChipProps) {
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  const popupId = useId();
  const [infoOpen, setInfoOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const removeBlock = usePlanner((state) => state.removeBlock);
  const flashing = usePlanner((state) => state.flashBlockId === blockId);
  const prereqAst = useMemo(() => parsePrereq(entry?.prerequisite), [entry?.prerequisite]);
  const coreqAst = useMemo(() => parsePrereq(entry?.corequisite), [entry?.corequisite]);
  const invalid = validation?.ok === false;
  const issueCount = validation?.missing.length ?? 0;
  const title = entry?.title || code;

  function startDrag(event: React.MouseEvent | React.TouchEvent) {
    forwardPlannerDragActivator(event, listeners);
  }

  return (
    <>
      <div
        ref={ghost ? undefined : ref}
        style={ghost ? undefined : style}
        data-course-chip
        data-block-id={blockId}
        data-lookup-code={blockId ? undefined : code}
        inert={ghost || undefined}
        aria-hidden={ghost || undefined}
        onMouseDown={ghost ? undefined : startDrag}
        onTouchStart={ghost ? undefined : startDrag}
        className={`neu-raised bg-surface-container relative flex w-full min-w-0 shrink-0 cursor-grab touch-pan-y flex-col rounded-lg border px-2 py-1 font-sans select-none active:cursor-grabbing ${invalid ? "border-error" : "border-transparent"} ${flashing ? "planner-flash" : ""}`}
      >
        <div className="flex min-w-0 items-center gap-1">
          <span
            className={`min-w-0 flex-1 truncate text-sm leading-5 font-medium ${invalid ? "text-error" : "text-on-surface"}`}
            title={code}
          >
            {code}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="denseIcon"
              ref={infoButtonRef}
              disabled={!entry}
              aria-haspopup="dialog"
              aria-expanded={infoOpen && !ghost}
              aria-controls={infoOpen && !ghost ? popupId : undefined}
              aria-label={
                invalid
                  ? `Show ${code} details (${issueCount} placement issue${issueCount === 1 ? "" : "s"})`
                  : `Show ${code} details`
              }
              onClick={ghost ? undefined : () => setInfoOpen((current) => !current)}
              className={invalid ? "text-error" : undefined}
            >
              <Icon name={invalid ? "alert" : "info"} size={14} />
            </Button>
            <Button
              variant="ghost"
              size="compact"
              aria-expanded={placing}
              onClick={ghost ? undefined : () => setPlacing((current) => !current)}
            >
              {blockId ? "Move" : "Add"}
            </Button>
            {blockId ? (
              <Button
                variant="ghost"
                size="denseIcon"
                aria-label={`Remove ${code}`}
                title={`Remove ${code}`}
                onClick={ghost ? undefined : () => removeBlock(blockId)}
                className="text-muted enabled:hover:bg-error-container enabled:hover:text-error"
              >
                <Icon name="close" size={14} />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 leading-5">
          <span className="text-on-surface-variant text-body-sm min-w-0 flex-1 truncate leading-5" title={title}>
            {title}
          </span>
          <span className="text-muted shrink-0 text-right text-xs whitespace-nowrap tabular-nums">
            {entry?.credits != null ? `${entry.credits} cr` : ""}
          </span>
        </div>
      </div>
      <Disclosure open={placing && !ghost}>
        <CoursePlacementSelect
          mode={blockId ? "move" : "add"}
          code={code}
          blockId={blockId}
          shadowOn="surface-container"
          onPlaced={() => {
            setPlacing(false);
            onPlaced?.();
          }}
        />
      </Disclosure>
      <AnimatePresence initial={false}>
        {infoOpen && entry && !ghost ? (
          <CourseInfoPopup
            course={entry}
            anchorRef={infoButtonRef}
            id={popupId}
            prereqAst={prereqAst}
            coreqAst={coreqAst}
            completedBefore={validation?.completedBefore}
            completedSameOrBefore={validation?.completedSameOrBefore}
            issues={validation?.missing}
            onClose={() => setInfoOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
