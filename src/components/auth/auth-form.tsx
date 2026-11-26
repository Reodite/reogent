"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { Icon } from "@/src/components/icons";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { BackLink, Button, buttonClasses } from "@/src/components/ui/button";
import { Field, TextInput } from "@/src/components/ui/form-controls";
import { Heading } from "@/src/components/ui/heading";
import { InlineLink } from "@/src/components/ui/inline-action";
import { Skeleton, SkeletonGroup } from "@/src/components/ui/skeleton";
import { safeAuthRedirect } from "@/src/lib/auth-redirect";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface AuthFormProps {
  mode: "login" | "signup";
  authMode: "oauth" | "password";
  providerIds?: string[];
}

/** Messages for the error codes OAuth routes add to /login. */
const OAUTH_ERRORS: Record<string, string> = {
  oauth_unavailable: "Sign-in isn't set up on this server.",
  oauth_cancelled: "Sign-in was cancelled.",
  oauth_failed: "Sign-in failed. Try again.",
};

export function AuthFormLoading({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex w-full max-w-80 flex-col gap-3">
      <span data-auth-loading-feedback className="h-8 shrink-0" />
      <Skeleton data-auth-loading-action className="h-12 w-full rounded-xl" />
    </SkeletonGroup>
  );
}

export function AuthForm({ mode, authMode, providerIds = [] }: AuthFormProps) {
  const auth = useAppAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const safeRedirect = safeAuthRedirect(searchParams.get("redirect"));
  const oauthError = OAUTH_ERRORS[searchParams.get("error") ?? ""] ?? "";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const shownError = error || oauthError;
  const authenticatedAccount = auth.status === "signedIn" && !auth.isGuest;
  const oppositeHref = mode === "login" ? "/signup" : "/login";

  useEffect(() => {
    if (authenticatedAccount) router.replace(safeRedirect);
  }, [authenticatedAccount, router, safeRedirect]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    const result =
      mode === "login" ? await auth.signIn(username.trim(), password) : await auth.register(username.trim(), password);
    setPending(false);
    if (result.error) setError(result.error);
  }

  if (auth.status === "initializing" || authenticatedAccount) {
    return <AuthFormLoading label={mode === "login" ? "Loading sign in" : "Loading sign up"} />;
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div data-auth-error-slot className="flex min-h-8 items-center justify-center">
        <AnimatePresence>
          {shownError ? (
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
              {shownError}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
      {authMode === "password" ? (
        <>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field label="Username" htmlFor="auth-username">
              <TextInput
                id="auth-username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={64}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                aria-invalid={!!shownError}
                aria-describedby={shownError ? "auth-error" : undefined}
                shadowOn="background"
              />
            </Field>
            <Field label={mode === "signup" ? "Password (12+ characters)" : "Password"} htmlFor="auth-password">
              <TextInput
                id="auth-password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                maxLength={mode === "signup" ? 72 : 128}
                minLength={mode === "signup" ? 12 : 1}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                aria-invalid={!!shownError}
                aria-describedby={shownError ? "auth-error" : undefined}
                shadowOn="background"
              />
            </Field>
            <Button type="submit" variant="primary" size="large" disabled={pending} className="w-full">
              {pending
                ? mode === "login"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>
          <p className="text-muted flex min-h-11 items-center justify-center text-sm">
            {mode === "login" ? "Need an account?" : "Already have an account?"}{" "}
            <InlineLink
              href={`${oppositeHref}?redirect=${encodeURIComponent(safeRedirect)}`}
              className="ml-1 font-medium"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </InlineLink>
          </p>
        </>
      ) : (
        <>
          {providerIds.includes("google") && (
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
          )}
          <p className="text-muted flex min-h-11 items-center justify-center text-center text-sm">
            Sign in or create an account with a linked provider.
          </p>
        </>
      )}
    </div>
  );
}

const AUTH_PAGE_COPY = {
  oauth: {
    login: { title: "Welcome back", subtitle: "Sign in to continue to Reodite", loading: "Loading sign in" },
    signup: {
      title: "Get started with Reodite",
      subtitle: "Create an account or sign in with Google",
      loading: "Loading Google sign in",
    },
  },
  password: {
    login: { title: "Welcome back", subtitle: "Sign in with your account", loading: "Loading sign in" },
    signup: { title: "Create an account", subtitle: "Sign up to start using Reodite", loading: "Loading sign up" },
  },
} as const;

/** Renders the sign-in or sign-up page: sticky back link, branded heading, form, and theme footer. */
export function AuthPage({ mode, authMode, providerIds = [] }: AuthFormProps) {
  const copy = AUTH_PAGE_COPY[authMode][mode];
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
            <AuthForm mode={mode} authMode={authMode} providerIds={providerIds} />
          </Suspense>
        </div>
      </div>
      <footer className="flex items-center justify-center pb-2">
        <ThemeToggle />
      </footer>
    </div>
  );
}
