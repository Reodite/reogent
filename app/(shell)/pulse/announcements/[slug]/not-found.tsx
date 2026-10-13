import { ButtonLink } from "@/src/components/ui/button";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";

export default function AnnouncementNotFound() {
  return (
    <WorkspacePage composition="single" title="Announcement not found">
      <WorkspaceCanvas padding="md">
        <div className="mx-auto w-full max-w-prose py-8 text-center">
          <p className="text-muted mb-4 text-sm">This announcement may have moved or is no longer available.</p>
          <ButtonLink href="/pulse/announcements">View announcements</ButtonLink>
        </div>
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}
