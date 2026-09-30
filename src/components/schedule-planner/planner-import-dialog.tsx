"use client";

import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { DialogActions, DialogHeader, DialogPanel, DialogRoot } from "@/src/components/ui/dialog";
import { Field, SelectInput } from "@/src/components/ui/form-controls";
import { Heading } from "@/src/components/ui/heading";
import { InfoChip } from "@/src/components/ui/info-chip";
import type { CourseDoc } from "@/src/lib/api-types";
import { normalizeDays } from "@/src/lib/schedule";
import type { PlannerImportReview } from "@/src/lib/schedule-planner-import";
import { minutesToFullLabel } from "@/src/lib/schedule/util/time";
import { useState } from "react";
import { normalizeScheduleCode, type ScheduleImportMode, type ScheduleImportSelection } from "./schedule-store";

function importSectionOption(section: CourseDoc["sections"][number]): string {
  const days = normalizeDays(section.days);
  const when =
    section.start_time && section.end_time
      ? `${days.length ? days.join("/") : "TBA"} · ${section.start_time}–${section.end_time}`
      : "Time TBA";
  const instructor = section.instructor ? ` · ${section.instructor}` : "";
  const status = section.status ? ` · ${section.status}` : "";
  return `${section.section} · ${when}${instructor}${status}`;
}

/** Reviews catalog matches and collects ambiguous section choices before applying a Workday import. */
export function PlannerImportDialog({
  review,
  onApply,
  onClose,
}: {
  review: PlannerImportReview;
  onApply: (selections: ScheduleImportSelection[], mode: ScheduleImportMode) => void;
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const unresolved = review.matches.filter((match) => match.status === "ambiguous" && !choices[match.source.id]);
  const selections = review.matches.flatMap((match): ScheduleImportSelection[] => {
    const section =
      match.status === "exact"
        ? match.candidates[0]
        : match.candidates.find((candidate) => candidate.section === choices[match.source.id]);
    return match.doc && section ? [{ doc: match.doc, section }] : [];
  });

  return (
    <DialogRoot onDismiss={onClose} backdropLabel="Cancel Workday import" placement="mobile-sheet">
      <DialogPanel
        aria-labelledby="schedule-import-title"
        size="lg"
        padding="none"
        className="flex max-h-[min(48rem,calc(100dvh-1.5rem))] flex-col overflow-hidden"
      >
        <DialogHeader
          title="Review Workday import"
          titleId="schedule-import-title"
          description={
            <>
              {review.sourceFileName ?? "Workday schedule"} matched {selections.length} of {review.matches.length}{" "}
              sections.
            </>
          }
          className="border-border-subtle border-b p-4 sm:p-6"
          closeAction={
            <Button
              data-dialog-initial-focus
              onClick={onClose}
              aria-label="Close Workday import review"
              variant="ghost"
              size="denseIcon"
            >
              <Icon name="close" className="size-4" />
            </Button>
          }
        />

        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
          <div className="flex flex-col gap-2">
            {review.matches.map((match) => {
              const meeting = match.source.meetings[0];
              const meetingLabel = meeting
                ? `${meeting.days.join("/")} · ${minutesToFullLabel(meeting.startMin)}–${minutesToFullLabel(meeting.endMin)}`
                : "Time TBA";
              const code = normalizeScheduleCode(match.source.courseCode);
              const selectId = `schedule-import-${match.source.id}`;
              return (
                <article key={match.source.id} className="bg-surface-container-low rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Heading as="h3" size="subsection">
                        {code || match.source.title}
                      </Heading>
                      <p className="text-muted mt-1 truncate text-xs">{match.source.title}</p>
                      <p className="text-on-surface-variant mt-1 text-xs">{meetingLabel}</p>
                    </div>
                    <InfoChip
                      tone={match.status === "exact" ? "neutral" : match.status === "ambiguous" ? "caution" : "error"}
                      className="shrink-0"
                    >
                      {match.status === "exact"
                        ? "Matched"
                        : match.status === "ambiguous"
                          ? "Choose section"
                          : "Skipped"}
                    </InfoChip>
                  </div>
                  {match.status === "ambiguous" ? (
                    <Field label="Catalog section" htmlFor={selectId} className="mt-3">
                      <SelectInput
                        id={selectId}
                        value={choices[match.source.id] ?? ""}
                        onChange={(event) =>
                          setChoices((current) => ({ ...current, [match.source.id]: event.target.value }))
                        }
                        shadowOn="surface-container-low"
                      >
                        <option value="">Choose the section from Workday</option>
                        {match.candidates.map((candidate) => (
                          <option key={candidate.section} value={candidate.section}>
                            {importSectionOption(candidate)}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                  ) : null}
                  {match.reason ? <p className="text-muted mt-2 text-xs leading-relaxed">{match.reason}</p> : null}
                  {match.candidates[0]?.status && !/open|active|available/i.test(match.candidates[0].status) ? (
                    <p className="text-tertiary mt-2 text-xs">Catalog status: {match.candidates[0].status}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        <footer className="border-border-subtle shrink-0 border-t p-4 sm:p-6">
          {unresolved.length > 0 ? (
            <p className="text-tertiary mb-3 text-xs">
              Choose a section for {unresolved.length} ambiguous row(s) to continue.
            </p>
          ) : null}
          <DialogActions layout="stack" spacing="none">
            <Button size="prominent" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="prominent"
              disabled={selections.length === 0 || unresolved.length > 0}
              onClick={() => onApply(selections, "replace")}
            >
              Replace planner
            </Button>
            <Button
              variant="primary"
              size="prominent"
              disabled={selections.length === 0 || unresolved.length > 0}
              onClick={() => onApply(selections, "merge")}
            >
              Merge with planner
            </Button>
          </DialogActions>
        </footer>
      </DialogPanel>
    </DialogRoot>
  );
}
