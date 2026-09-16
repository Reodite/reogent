import { Button } from "@/src/components/ui/button";
import { DialogActions, DialogHeader, DialogPanel, DialogRoot } from "@/src/components/ui/dialog";
import { Skeleton, SkeletonFields, SkeletonGroup, SkeletonText } from "@/src/components/ui/skeleton";
import { AVATAR_COLORS } from "@/src/lib/schedule/avatar";
import type { Avatar } from "@/src/lib/schedule/types";

export function ScheduleToolbarSkeleton() {
  return (
    <SkeletonGroup label="Loading schedule terms" className="flex w-max gap-1 rounded-lg p-1">
      <Skeleton className="h-11 w-32 rounded-md sm:h-8" />
      <Skeleton className="h-11 w-32 rounded-md sm:h-8" />
    </SkeletonGroup>
  );
}

export function ScheduleControlsSkeleton({ label, includeGroup = false }: { label: string; includeGroup?: boolean }) {
  return (
    <SkeletonGroup label={label}>
      {includeGroup ? (
        <div className="flex flex-col gap-1.5 py-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ) : null}
      <div className="border-border-subtle grid grid-cols-2 gap-2 border-t py-4">
        <Skeleton className="h-11 rounded-lg sm:h-10" />
        <Skeleton className="h-11 rounded-lg sm:h-10" />
      </div>
      <div className="border-border-subtle border-t py-4">
        <div className="mb-2 flex min-h-9 items-center">
          <Skeleton className="h-5 w-20" />
        </div>
        {[0, 1].map((row) => (
          <div key={row} className="flex min-h-11 items-center gap-2.5 px-2 py-1.5">
            <Skeleton className="size-[30px] rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="size-5" />
          </div>
        ))}
      </div>
      <div className="border-border-subtle space-y-2 border-t py-4">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="size-5" />
        </div>
        <SkeletonText lines={2} />
      </div>
      <div className="border-border-subtle space-y-2 border-t py-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </SkeletonGroup>
  );
}

export function ScheduleProfileSkeleton({
  title,
  avatarKind = "initials",
  onCancel,
}: {
  title: string;
  avatarKind?: Avatar["kind"];
  onCancel: () => void;
}) {
  return (
    <DialogRoot onDismiss={onCancel} backdropLabel="Cancel schedule profile">
      <DialogPanel aria-label={title} size="md" padding="none" className="flex flex-col overflow-hidden">
        <DialogHeader title={title} className="p-4 pb-0 sm:p-6 sm:pb-0" />
        <div data-dialog-scroll className="min-h-0 space-y-4 overflow-y-auto p-4 sm:px-6">
          <SkeletonGroup
            label="Loading schedule profile"
            className="bg-surface-container-low flex items-center gap-3 rounded-lg p-3"
          >
            <Skeleton className="size-10 rounded-full" />
            <SkeletonText lines={2} className="flex-1" />
          </SkeletonGroup>
          <SkeletonFields label="Loading handle field" fields={1} />
          <SkeletonGroup label="Loading avatar choices" className="flex flex-col gap-2">
            <Skeleton className="h-4 w-12" />
            <div className="flex gap-1.5">
              {[0, 1, 2].map((tab) => (
                <Skeleton key={tab} className="h-11 flex-1 rounded-lg sm:h-9" />
              ))}
            </div>
            {avatarKind === "emoji" ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : avatarKind === "image" ? (
              <Skeleton className="h-11 w-full rounded-lg sm:h-10" />
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {AVATAR_COLORS.map((color) => (
                <div key={color} className="flex size-11 items-center justify-center sm:size-8">
                  <Skeleton className="size-6 rounded-full" />
                </div>
              ))}
            </div>
          </SkeletonGroup>
        </div>
        <footer className="shrink-0 px-4 pb-4 sm:px-6 sm:pb-6">
          <DialogActions spacing="none">
            <Button size="prominent" data-dialog-initial-focus onClick={onCancel}>
              Cancel
            </Button>
            <Skeleton className="h-11 w-36 rounded-lg sm:h-10" />
          </DialogActions>
        </footer>
      </DialogPanel>
    </DialogRoot>
  );
}
