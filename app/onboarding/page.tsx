"use client";

import { AudioVolumeControl } from "@/src/components/audio/audio-controls";
import { useAppAuth } from "@/src/components/auth/app-auth";
import { ProfileFields } from "@/src/components/auth/profile-fields";
import { Icon } from "@/src/components/icons";
import { useProfile, useTheme } from "@/src/components/providers";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { Button } from "@/src/components/ui/button";
import { Heading } from "@/src/components/ui/heading";
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
  const [draft, setDraft] = useState<StudentProfile>(() => ({ ...profile }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const focusHeading = useCallback((heading: HTMLHeadingElement | null) => heading?.focus(), []);

  useEffect(() => {
    if (auth.status === "signedOut") router.replace(`/login?redirect=${encodeURIComponent(destination)}`);
    else if (auth.isGuest) router.replace("/app/tools/map");
    else if (profile?.onboarding_completed) router.replace(destination);
  }, [auth.status, auth.isGuest, profile?.onboarding_completed, destination, router]);

  async function finish(skip = false) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await saveProfile({
        ...(skip ? profile : draft),
        theme: mode,
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
            {step === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                <Heading as="h1" size="title" ref={focusHeading} tabIndex={-1} className="outline-none">
                  Welcome to Reodite
                </Heading>
                <p className="text-muted text-sm">Let&apos;s customize your experience</p>
              </div>
            ) : (
              <>
                <Heading as="h1" size="title" ref={focusHeading} tabIndex={-1} className="outline-none">
                  {step === 1 ? "A little about you" : "Make yourself at home"}
                </Heading>
                <fieldset disabled={saving} className="mt-3 min-w-0">
                  <legend className="sr-only">{STEPS[step]}</legend>
                  <p className="text-muted mb-6 text-sm">
                    {step === 1
                      ? "Share what you'd like. You can leave any field blank."
                      : "Choose your appearance and sound. You can change them in Settings anytime."}
                  </p>
                  {step === 1 ? (
                    <ProfileFields profile={draft} onChange={setDraft} />
                  ) : (
                    <div className="flex flex-col gap-6">
                      <div className="flex flex-col gap-2">
                        <span className="text-on-surface text-sm font-medium">Appearance</span>
                        <ThemeToggle showLabels />
                      </div>
                      <AudioVolumeControl />
                    </div>
                  )}
                </fieldset>
              </>
            )}
          </motion.div>
          {error && (
            <p role="alert" className="text-error mt-6 text-sm">
              {error}
            </p>
          )}
          <div className="mt-8 flex items-center justify-between gap-4">
            <Button
              variant="ghost"
              size="fieldIcon"
              disabled={step === 0 || saving}
              onClick={() => setStep(step - 1)}
              aria-label={step === 2 ? "Back to personal details" : "Back to welcome"}
              title={step === 2 ? "Back to personal details" : "Back to welcome"}
            >
              <Icon name="arrowLeft" size={20} />
            </Button>
            <Button type="submit" variant="primary" size="large" disabled={saving}>
              {saving ? "Saving…" : step === 2 ? "Finish setup" : "Next"}
              {!saving && <Icon name={step === 2 ? "check" : "right"} size={16} />}
            </Button>
          </div>
        </form>
        <div className="mt-4 flex justify-center">
          <Button
            variant="ghost"
            size="field"
            shadowOn="background"
            disabled={saving}
            onClick={() => void finish(true)}
            className="underline underline-offset-4"
          >
            Skip setup
          </Button>
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
