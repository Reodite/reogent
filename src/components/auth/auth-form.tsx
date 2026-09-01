"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { Button } from "@/src/components/ui/button";
import { TextInput } from "@/src/components/ui/form-controls";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const auth = useAppAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const usernameRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const redirect = searchParams.get("redirect") || "/chat";
  // Validate redirect: allow only relative paths to prevent open redirect
  const safeRedirect = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/chat";
  const oppositeHref =
    mode === "login"
      ? `/signup?redirect=${encodeURIComponent(safeRedirect)}`
      : `/login?redirect=${encodeURIComponent(safeRedirect)}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);

    const trimmedUsername = username.trim();
    const result =
      mode === "login" ? await auth.signIn(trimmedUsername, password) : await auth.register(trimmedUsername, password);

    setPending(false);
    if (result.error) {
      setError(result.error);
      usernameRef.current?.focus();
    } else {
      router.push(safeRedirect);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={pending} className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="auth-username" className="text-on-surface-variant text-xs font-medium">
          Username
        </label>
        <TextInput
          ref={usernameRef}
          id="auth-username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={64}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          aria-invalid={!!error}
          aria-describedby={error ? "auth-error" : undefined}
          shadowOn="background"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="auth-password" className="text-on-surface-variant text-xs font-medium">
          Password{mode === "signup" && <span className="text-muted ml-1">(6+ characters)</span>}
        </label>
        <TextInput
          id="auth-password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          aria-invalid={!!error}
          aria-describedby={error ? "auth-error" : undefined}
          shadowOn="background"
        />
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            id="auth-error"
            role="alert"
            aria-live="assertive"
            className="text-error text-center text-xs"
            initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <Button
        type="submit"
        variant="primary"
        size="large"
        shadowOn="background"
        disabled={pending}
        aria-busy={pending}
        className="mt-1 w-full"
      >
        {pending
          ? mode === "login"
            ? "Signing in…"
            : "Creating account…"
          : mode === "login"
            ? "Sign in"
            : "Create account"}
      </Button>
      <p className="text-muted flex min-h-[44px] items-center justify-center text-sm">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <Link href={oppositeHref} className="text-primary ml-1 font-medium underline">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href={oppositeHref} className="text-primary ml-1 font-medium underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
