"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { Button } from "@/src/components/ui/button";
import { RetryState } from "@/src/components/ui/feedback";
import { Field, SelectInput, TextInput } from "@/src/components/ui/form-controls";
import { Heading } from "@/src/components/ui/heading";
import { Skeleton, SkeletonGroup } from "@/src/components/ui/skeleton";
import {
  WorkspaceCanvas,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceRail,
  type WorkspaceView,
} from "@/src/components/ui/workspace";
import type { StudentProfile } from "@/src/shared/profile";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type ProfileStatus = "loading" | "load-error" | "idle" | "saving" | "saved" | "error";

function ProfileFormLoading() {
  return (
    <SkeletonGroup label="Loading student profile" className="ui-content-enter flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {["year", "student-type"].map((field) => (
          <div key={field} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <Skeleton data-profile-loading-action className="h-11 w-36 rounded-xl sm:h-10" />
      <Skeleton className="h-3 w-4/5" />
    </SkeletonGroup>
  );
}

/** Loads and saves the student defaults used by tuition and program answers. */
function ProfileForm() {
  const api = useApi();
  const [profile, setProfile] = useState<StudentProfile>({});
  const [status, setStatus] = useState<ProfileStatus>("loading");

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
      await api.saveProfile(profile);
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
  return (
    <form onSubmit={handleSubmit} aria-busy={saving} className="ui-content-enter flex flex-col gap-3">
      <fieldset disabled={saving} className="flex flex-col gap-3 disabled:opacity-70">
        <Field label="Program" htmlFor="settings-program">
          <TextInput
            id="settings-program"
            shadowOn="surface-container-low"
            type="text"
            maxLength={120}
            placeholder="e.g. Computer Science"
            value={profile.program ?? ""}
            onChange={(event) => updateProfile({ program: event.target.value || undefined })}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Year" htmlFor="settings-year">
            <SelectInput
              id="settings-year"
              shadowOn="surface-container-low"
              value={profile.year ?? ""}
              onChange={(event) => updateProfile({ year: event.target.value ? Number(event.target.value) : undefined })}
            >
              <option value="">Not set</option>
              {[1, 2, 3, 4, 5, 6, 7].map((year) => (
                <option key={year} value={year}>
                  Year {year}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Student type" htmlFor="settings-student-type">
            <SelectInput
              id="settings-student-type"
              shadowOn="surface-container-low"
              value={profile.student_type ?? ""}
              onChange={(event) =>
                updateProfile({
                  student_type: (event.target.value || undefined) as StudentProfile["student_type"],
                })
              }
            >
              <option value="">Not set</option>
              <option value="domestic">Domestic</option>
              <option value="international">International</option>
            </SelectInput>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="prominent">
            <Icon name="check" size={16} />
            {saving ? "Saving…" : "Save profile"}
          </Button>
          <p role="status" className={`text-xs ${status === "error" ? "text-error" : "text-muted"}`}>
            {status === "saved" || status === "error" ? (
              <span key={status} className="ui-notice-enter inline-block">
                {status === "saved" ? "Saved" : "Couldn't save. Try again."}
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
  const [mobileView, setMobileView] = useState<WorkspaceView>("main");
  const username = auth.user?.username || "User";
  const initial = username.trim().charAt(0).toUpperCase() || "U";

  return (
    <WorkspacePage
      composition="split"
      title="Settings"
      description="Manage your account, student defaults, and appearance."
      view={mobileView}
      onViewChange={setMobileView}
      mainLabel="Student profile"
      railLabel="Account and appearance"
      rail={
        <WorkspaceRail>
          <WorkspacePanel title="Account" padding="md">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="bg-primary-container text-on-primary-container flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-medium">
                  {initial}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-on-surface truncate text-sm font-medium" title={username}>
                    {username}
                  </p>
                  <p className="text-muted text-xs">{auth.isGuest ? "Guest session" : "Signed in"}</p>
                </div>
              </div>
              <Button variant="danger" size="field" onClick={auth.signOut}>
                <Icon name="exit" size={16} />
                Sign out
              </Button>
            </div>
          </WorkspacePanel>
          <WorkspacePanel title="Appearance" padding="md">
            <div className="flex flex-col gap-3">
              <div className="space-y-1">
                <p className="text-on-surface text-sm font-medium">Theme</p>
                <p className="text-muted text-xs">Light, match system, or dark</p>
              </div>
              <ThemeToggle />
            </div>
          </WorkspacePanel>
        </WorkspaceRail>
      }
    >
      <WorkspaceCanvas padding="md">
        <section
          data-settings-profile
          aria-labelledby="settings-profile-title"
          className="mx-auto flex w-full max-w-2xl flex-col gap-4"
        >
          <header className="flex flex-col gap-1">
            <Heading as="h2" size="section" id="settings-profile-title">
              Student profile
            </Heading>
            {auth.isGuest ? (
              <p className="text-on-surface-variant text-sm">
                Guest sessions do not save student defaults. Sign in to set your program, year, and student type.
              </p>
            ) : null}
          </header>
          {!auth.isGuest ? <ProfileForm /> : null}
        </section>
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}
