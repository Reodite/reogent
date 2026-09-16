"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { PreferenceFields, ProfileFields } from "@/src/components/auth/profile-fields";
import { Icon } from "@/src/components/icons";
import { useProfile, useTheme } from "@/src/components/providers";
import { ThemeToggle } from "@/src/components/theme-toggle";
import type { StudentProfile } from "@/src/shared/profile";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

export default function SettingsPage() {
  const auth = useAppAuth();
  const router = useRouter();
  const { profile, saveProfile } = useProfile();
  const { mode } = useTheme();
  const [draft, setDraft] = useState<StudentProfile>(() => ({ ...profile, theme: profile?.theme ?? mode }));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (auth.status === "signedOut") router.replace("/login?redirect=%2Fsettings");
  }, [auth.status, router]);

  function updateDraft(next: StudentProfile) {
    setDraft(next);
    setStatus("idle");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "saving") return;
    setStatus("saving");
    try {
      await saveProfile(draft);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  if (auth.status !== "signedIn") return null;
  const username = auth.user?.username || "User";
  const initial = username.trim().charAt(0).toUpperCase() || "U";
  const saving = status === "saving";

  return (
    <div className="auth-canvas flex min-h-svh flex-col px-4 py-8">
      <nav className="flex items-center">
        <Link
          href={auth.isGuest ? "/tools" : "/chat"}
          className="text-on-surface-variant hover:text-on-surface flex min-h-11 items-center gap-2 rounded-lg px-2 py-2.5 text-sm transition-colors duration-150"
        >
          <Icon name="left" size={16} />
          <span>Back</span>
        </Link>
      </nav>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 py-8">
        <h1 className="text-on-surface text-xl font-medium tracking-[-0.02em]">Settings</h1>
        <form onSubmit={handleSubmit} aria-busy={saving} className="flex flex-col gap-4">
          <section aria-labelledby="settings-account" className="neu-panel rounded-2xl p-4 sm:p-6">
            <h2 id="settings-account" className="text-on-surface text-base font-medium tracking-[-0.01em]">
              Account
            </h2>
            <div className="mt-4 flex items-center gap-3">
              <span className="bg-primary-container text-on-primary-container flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-medium">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="text-on-surface truncate text-sm font-medium" title={username}>
                  {username}
                </p>
                <p className="text-muted text-xs">{auth.isGuest ? "Guest session" : "Signed in"}</p>
              </div>
            </div>
            {!auth.isGuest && (
              <fieldset disabled={saving} className="mt-6 min-w-0">
                <legend className="sr-only">Student profile</legend>
                <ProfileFields profile={draft} onChange={updateDraft} />
                <p className="text-muted mt-4 text-xs">
                  The assistant uses your profile for tuition, cost, and program questions.
                </p>
              </fieldset>
            )}
            <button
              type="button"
              onClick={auth.signOut}
              className="neu-button bg-surface text-on-surface hover:text-error mt-4 flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium"
            >
              <Icon name="exit" size={16} />
              Sign out
            </button>
          </section>
          <section aria-labelledby="settings-preferences" className="neu-panel rounded-2xl p-4 sm:p-6">
            <h2 id="settings-preferences" className="text-on-surface text-base font-medium tracking-[-0.01em]">
              Preferences
            </h2>
            {auth.isGuest ? (
              <div className="mt-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-on-surface text-sm font-medium">Theme</p>
                  <p className="text-muted text-xs">Light, match system, or dark</p>
                </div>
                <ThemeToggle />
              </div>
            ) : (
              <fieldset disabled={saving} className="mt-4 min-w-0">
                <legend className="sr-only">Preferences</legend>
                <PreferenceFields profile={draft} onChange={updateDraft} />
              </fieldset>
            )}
          </section>
          {!auth.isGuest && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="neu-primary-button bg-primary text-on-primary flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon name="check" size={16} />
                {saving ? "Saving…" : "Save changes"}
              </button>
              <p role="status" className={`text-xs ${status === "error" ? "text-error" : "text-muted"}`}>
                {status === "saved" ? "Saved" : status === "error" ? "Couldn't save your changes. Try again." : ""}
              </p>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
