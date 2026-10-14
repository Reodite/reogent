"use client";

import { AudioSettings } from "@/src/components/audio/audio-controls";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { Heading } from "@/src/components/ui/heading";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";

export default function SettingsPage() {
  return (
    <WorkspacePage composition="single" title="Settings" description="Choose your appearance and sound.">
      <WorkspaceCanvas padding="md">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <section aria-labelledby="settings-appearance-title" className="flex flex-col gap-4">
            <Heading as="h2" size="section" id="settings-appearance-title">
              Appearance
            </Heading>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-on-surface text-sm font-medium">Theme</p>
                <p className="text-muted text-xs">Choose light or dark</p>
              </div>
              <ThemeToggle />
            </div>
          </section>
          <AudioSettings />
        </div>
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}
