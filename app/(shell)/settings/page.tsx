"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { ProfileFields } from "@/src/components/auth/profile-fields";
import { Icon } from "@/src/components/icons";
import { useApi, useProfile, useTheme } from "@/src/components/providers";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { Button } from "@/src/components/ui/button";
import { RetryState } from "@/src/components/ui/feedback";
import { Heading } from "@/src/components/ui/heading";
import { Skeleton, SkeletonGroup } from "@/src/components/ui/skeleton";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";
import type { StudentProfile } from "@/src/shared/profile";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type ProfileStatus = "loading" | "load-error" | "idle" | "saving" | "saved" | "error";

function ProfileFormLoading() {
  return (
    <SkeletonGroup label="Loading student profile" className="ui-content-enter flex flex-col gap-3">
      {["name", "year", "program"].map((field) => (
        <div key={field} className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <Skeleton data-profile-loading-action className="h-11 w-36 rounded-xl sm:h-10" />
      <Skeleton className="h-3 w-4/5" />
    </SkeletonGroup>
  );
}

/** Refreshes the account profile and saves shared onboarding details and preferences. */
function ProfileForm() {
  const api = useApi();
  const { saveProfile } = useProfile();
  const { mode } = useTheme();
  const [profile, setProfile] = useState<StudentProfile>({});
  const [status, setStatus] = useState<ProfileStatus>("loading");
  const [savedMode, setSavedMode] = useState(mode);

  const loadProfile = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await api.getProfile();
      setProfile(response.profile ?? {});
      setStatus("idle");
    } catch {
      setStatus("load-error");
    }
  }, [api]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  function updateProfile(update: Partial<StudentProfile>) {
    setProfile((current) => ({ ...current, ...update }));
    setStatus("idle");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading" || status === "load-error" || status === "saving") return;
    setStatus("saving");
    try {
      await saveProfile({ ...profile, theme: mode });
      setSavedMode(mode);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  if (status === "loading") return <ProfileFormLoading />;
  if (status === "load-error") {
    return (
      <RetryState
        title="Profile unavailable"
        message="Your saved student defaults could not be loaded. Editing stays locked to protect them."
        onRetry={() => void loadProfile()}
        align="start"
        className="ui-content-enter"
        compact
      />
    );
  }

  const saving = status === "saving";
  const saved = status === "saved" && savedMode === mode;
  return (
    <form onSubmit={handleSubmit} aria-busy={saving} className="ui-content-enter flex flex-col gap-3">
      <fieldset disabled={saving} className="flex flex-col gap-3 disabled:opacity-70">
        <ProfileFields profile={profile} onChange={updateProfile} shadowOn="surface-container-low" />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="prominent">
            <Icon name="check" size={16} />
            {saving ? "Saving…" : "Save profile"}
          </Button>
          <p role="status" className={`text-xs ${status === "error" ? "text-error" : "text-muted"}`}>
            {saved || status === "error" ? (
              <span key={status} className="ui-notice-enter inline-block">
                {saved ? "Saved" : "Couldn't save. Try again."}
              </span>
            ) : null}
          </p>
        </div>
      </fieldset>
      <p className="text-muted text-xs">The assistant uses these defaults for tuition, cost, and program questions.</p>
    </form>
  );
}

export default function SettingsPage() {
  const auth = useAppAuth();

  return (
    <WorkspacePage
      composition="single"
      title="Settings"
      description={auth.isGuest ? "Choose your appearance." : "Manage your student defaults and appearance."}
    >
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
          {!auth.isGuest && (
            <section
              data-settings-profile
              aria-labelledby="settings-profile-title"
              className="border-border-subtle flex flex-col gap-4 border-t pt-6"
            >
              <Heading as="h2" size="section" id="settings-profile-title">
                Student profile
              </Heading>
              <ProfileForm />
            </section>
          )}
        </div>
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}
