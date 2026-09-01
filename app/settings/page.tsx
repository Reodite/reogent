"use client";

// Standalone settings page (outside the shell, like /login): account details,
// student profile, and preferences. Signed-out visitors are sent to /login.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { Button } from "@/src/components/ui/button";
import { SelectInput, TextInput } from "@/src/components/ui/form-controls";
import type { StudentProfile } from "@/src/shared/profile";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

const LABEL_CLASS = "text-on-surface-variant flex flex-col gap-1 text-xs font-medium";

type ProfileStatus = "loading" | "load-error" | "idle" | "saving" | "saved" | "error";
const STATUS_TEXT: Partial<Record<ProfileStatus, string>> = {
  loading: "Loading…",
  "load-error": "Couldn't load your profile.",
  saved: "Saved",
  error: "Couldn't save. Try again.",
};

/** Program, year, and student type: the assistant's defaults for tuition,
 * cost, and program questions. Loads on mount; saves on submit. */
function ProfileForm() {
  const api = useApi();
  const [profile, setProfile] = useState<StudentProfile>({});
  const [status, setStatus] = useState<ProfileStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    api.getProfile().then(
      ({ profile }) => {
        if (cancelled) return;
        setProfile(profile ?? {});
        setStatus("idle");
      },
      () => {
        if (!cancelled) setStatus("load-error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    try {
      await api.saveProfile(profile);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const busy = status === "loading" || status === "saving";
  return (
    <form onSubmit={handleSubmit} aria-busy={busy} className="mt-4 flex flex-col gap-3">
      <label htmlFor="settings-program" className={LABEL_CLASS}>
        Program
        <TextInput
          id="settings-program"
          type="text"
          maxLength={120}
          placeholder="e.g. Computer Science"
          value={profile.program ?? ""}
          onChange={(e) => setProfile({ ...profile, program: e.target.value || undefined })}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor="settings-year" className={LABEL_CLASS}>
          Year
          <SelectInput
            id="settings-year"
            value={profile.year ?? ""}
            onChange={(e) => setProfile({ ...profile, year: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">Not set</option>
            {[1, 2, 3, 4, 5, 6, 7].map((year) => (
              <option key={year} value={year}>
                Year {year}
              </option>
            ))}
          </SelectInput>
        </label>
        <label htmlFor="settings-student-type" className={LABEL_CLASS}>
          Student type
          <SelectInput
            id="settings-student-type"
            value={profile.student_type ?? ""}
            onChange={(e) =>
              setProfile({ ...profile, student_type: (e.target.value || undefined) as StudentProfile["student_type"] })
            }
          >
            <option value="">Not set</option>
            <option value="domestic">Domestic</option>
            <option value="international">International</option>
          </SelectInput>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="prominent" disabled={busy}>
          <Icon name="check" size={16} />
          Save
        </Button>
        <p
          role="status"
          className={`text-xs ${status === "error" || status === "load-error" ? "text-error" : "text-muted"}`}
        >
          {STATUS_TEXT[status] ?? ""}
        </p>
      </div>
      <p className="text-muted text-xs">
        The assistant uses these as defaults for tuition, cost, and program questions.
      </p>
    </form>
  );
}

export default function SettingsPage() {
  const auth = useAppAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "signedOut") router.replace("/login");
  }, [auth.status, router]);

  if (auth.status !== "signedIn") return null;

  const username = auth.user?.username || "User";
  const initial = username.trim().charAt(0).toUpperCase() || "U";

  return (
    <div className="auth-canvas flex min-h-svh flex-col px-4 py-8">
      <nav className="flex items-center">
        <Link
          href={auth.isGuest ? "/tools" : "/chat"}
          className="text-on-surface-variant hover:text-on-surface flex min-h-[44px] items-center gap-2 rounded-lg px-2 py-2.5 text-sm transition-colors duration-150"
        >
          <Icon name="left" size={16} />
          <span>Back</span>
        </Link>
      </nav>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 py-8">
        <h1 className="text-on-surface text-xl font-medium tracking-[-0.02em]">Settings</h1>

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
          {!auth.isGuest && <ProfileForm />}
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
          <div className="mt-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-on-surface text-sm font-medium">Theme</p>
              <p className="text-muted text-xs">Light, match system, or dark</p>
            </div>
            <ThemeToggle />
          </div>
        </section>
      </main>
    </div>
  );
}
