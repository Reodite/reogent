"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { PreferenceFields, ProfileFields } from "@/src/components/auth/profile-fields";
import { Icon } from "@/src/components/icons";
import { useProfile, useTheme } from "@/src/components/providers";
import { safeAuthRedirect } from "@/src/lib/auth-redirect";
import type { StudentProfile } from "@/src/shared/profile";
import { motion, useReducedMotion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";

const STEPS = ["Welcome", "About you", "Preferences"];

function OnboardingContent() {
  const auth = useAppAuth();
  const { profile, saveProfile } = useProfile();
  const { mode } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = safeAuthRedirect(searchParams.get("redirect"));
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<StudentProfile>(() => ({ ...profile, theme: profile?.theme ?? mode }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const focusHeading = useCallback((heading: HTMLHeadingElement | null) => heading?.focus(), []);

  useEffect(() => {
    if (auth.status === "signedOut") router.replace(`/login?redirect=${encodeURIComponent(destination)}`);
    else if (auth.isGuest) router.replace("/tools");
    else if (profile?.onboarding_completed) router.replace(destination);
  }, [auth.status, auth.isGuest, profile?.onboarding_completed, destination, router]);

  async function finish(skip = false) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await saveProfile({
        ...(skip ? profile : draft),
        theme: skip ? (profile?.theme ?? mode) : draft.theme,
        onboarding_completed: true,
      });
      router.replace(destination);
    } catch {
      setError("Couldn't save your details. Your entries are still here. Try again.");
      setSaving(false);
    }
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 2) setStep(step + 1);
    else void finish();
  }

  if (auth.status !== "signedIn" || auth.isGuest || profile?.onboarding_completed) return null;

  return (
    <main className="auth-canvas flex min-h-svh flex-col items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-lg">
        <ol aria-label="Setup progress" className="mb-6 grid grid-cols-3 gap-3">
          {STEPS.map((label, index) => (
            <li
              key={label}
              aria-current={index === step ? "step" : undefined}
              className={`flex flex-col gap-2 text-xs ${index === step ? "text-primary font-medium" : "text-muted"}`}
            >
              <span
                aria-hidden="true"
                className={`h-1 rounded-full ${index <= step ? "bg-primary" : "bg-surface-container-high"}`}
              />
              <span>
                {index + 1}. {label}
              </span>
            </li>
          ))}
        </ol>
        <form onSubmit={next} aria-busy={saving} className="neu-panel rounded-2xl p-6 sm:p-8">
          <motion.div
            key={step}
            initial={reducedMotion ? false : { opacity: 0.5, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1
              ref={focusHeading}
              tabIndex={-1}
              className="text-on-surface text-2xl font-medium tracking-[-0.02em] outline-none"
            >
              {step === 0 ? "Welcome to Reodite" : step === 1 ? "A little about you" : "Make yourself at home"}
            </h1>
            {step === 0 ? (
              <div className="mt-4 flex min-h-56 flex-col gap-4">
                <p className="text-on-surface text-xl tracking-[-0.02em]">Let&apos;s customize your experience</p>
                <p className="text-muted max-w-sm text-sm leading-relaxed">
                  Tell us a little about yourself for answers that fit your studies and preferences.
                </p>
                <p className="text-muted mt-auto text-sm">
                  Everything is optional. You can update your choices in Settings anytime.
                </p>
              </div>
            ) : (
              <fieldset disabled={saving} className="mt-3 min-w-0">
                <legend className="sr-only">{STEPS[step]}</legend>
                <p className="text-muted mb-6 text-sm">
                  {step === 1
                    ? "Share what you'd like. You can leave any field blank."
                    : "Choose your appearance and defaults. You can change these in Settings anytime."}
                </p>
                {step === 1 ? (
                  <ProfileFields profile={draft} onChange={setDraft} />
                ) : (
                  <PreferenceFields profile={draft} onChange={setDraft} />
                )}
              </fieldset>
            )}
          </motion.div>
          {error && (
            <p role="alert" className="text-error mt-6 text-sm">
              {error}
            </p>
          )}
          <div className="mt-8 flex items-center justify-between gap-4">
            <button
              type="button"
              disabled={step === 0 || saving}
              onClick={() => setStep(step - 1)}
              className="neu-button text-on-surface-variant flex h-12 items-center gap-2 rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="left" size={16} /> Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="neu-primary-button bg-primary text-on-primary flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : step === 2 ? "Finish setup" : "Next"}
              {!saving && <Icon name={step === 2 ? "check" : "right"} size={16} />}
            </button>
          </div>
        </form>
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={saving}
            onClick={() => void finish(true)}
            className="text-muted hover:text-on-surface min-h-11 rounded-lg px-4 text-sm underline underline-offset-4 disabled:opacity-40"
          >
            Skip setup
          </button>
        </div>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}
