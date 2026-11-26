"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { Icon } from "@/src/components/icons";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { BackLink, buttonClasses } from "@/src/components/ui/button";
import { Heading } from "@/src/components/ui/heading";
import { Skeleton, SkeletonGroup } from "@/src/components/ui/skeleton";
import { safeAuthRedirect } from "@/src/lib/auth-redirect";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

interface AuthFormProps {
  mode: "login" | "signup";
}

/** Messages for the error codes the Google sign-in routes add to /login. */
const GOOGLE_ERRORS: Record<string, string> = {
  google_unavailable: "Google sign-in isn't set up on this server.",
  google_cancelled: "Google sign-in was cancelled.",
  google_failed: "Google sign-in failed. Try again.",
};

export function AuthFormLoading({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex w-full max-w-80 flex-col gap-3">
      <span data-auth-loading-feedback className="h-8 shrink-0" />
      <Skeleton data-auth-loading-action className="h-12 w-full rounded-xl" />
    </SkeletonGroup>
  );
}

export function AuthForm({ mode }: AuthFormProps) {
  const auth = useAppAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const safeRedirect = safeAuthRedirect(searchParams.get("redirect"));
  const googleError = GOOGLE_ERRORS[searchParams.get("error") ?? ""] ?? "";
  const authenticatedAccount = auth.status === "signedIn" && !auth.isGuest;

  useEffect(() => {
    if (authenticatedAccount) router.replace(safeRedirect);
  }, [authenticatedAccount, router, safeRedirect]);

  if (auth.status === "initializing" || authenticatedAccount) {
    return <AuthFormLoading label={mode === "login" ? "Loading sign in" : "Loading sign up"} />;
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div data-auth-error-slot className="flex min-h-8 items-center justify-center">
        <AnimatePresence>
          {googleError ? (
            <motion.p
              id="auth-error"
              role="alert"
              aria-live="assertive"
              className="text-error text-center text-xs leading-4"
              initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            >
              {googleError}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
      <a
        href={`/api/auth/google?redirect=${encodeURIComponent(safeRedirect)}`}
        className={buttonClasses({
          variant: "secondary",
          size: "large",
          shadowOn: "background",
          wrap: false,
          link: true,
          className: "w-full",
        })}
      >
        <Icon name="google" size={18} />
        Continue with Google
      </a>
      <p className="text-muted flex min-h-11 items-center justify-center text-center text-sm">
        Sign in or create an account with Google.
      </p>
    </div>
  );
}

const AUTH_PAGE_COPY = {
  login: { title: "Welcome back", subtitle: "Sign in to continue to Reodite", loading: "Loading sign in" },
  signup: {
    title: "Get started with Reodite",
    subtitle: "Create an account or sign in with Google",
    loading: "Loading Google sign in",
  },
} as const;

/** Renders the sign-in or sign-up page: sticky back link, branded heading, form, and theme footer. */
export function AuthPage({ mode }: AuthFormProps) {
  const copy = AUTH_PAGE_COPY[mode];
  return (
    <div className="auth-canvas flex min-h-svh flex-col pb-8">
      <nav className="bg-background sticky top-0 z-20 flex shrink-0 items-center pt-[max(1rem,env(safe-area-inset-top))] pb-4">
        <BackLink href="/" label="Back to home" shadowOn="background" />
      </nav>
      <div
        data-auth-content
        className="ui-content-enter flex flex-1 flex-col items-center justify-center py-6 sm:py-12"
      >
        <div className="flex w-full max-w-sm flex-col items-center">
          <span className="neu-raised bg-surface text-primary mb-8 flex size-14 items-center justify-center rounded-2xl">
            <Icon name="school" size={27} />
          </span>
          <Heading as="h1" size="title" className="mb-1 text-center">
            {copy.title}
          </Heading>
          <p className="text-muted mb-6 text-center text-sm">{copy.subtitle}</p>
          <Suspense fallback={<AuthFormLoading label={copy.loading} />}>
            <AuthForm mode={mode} />
          </Suspense>
        </div>
      </div>
      <footer className="flex items-center justify-center pb-2">
        <ThemeToggle />
      </footer>
    </div>
  );
}
