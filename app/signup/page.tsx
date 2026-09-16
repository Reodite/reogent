"use client";

import { AuthForm, AuthFormLoading } from "@/src/components/auth/auth-form";
import { Icon } from "@/src/components/icons";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { ButtonLink } from "@/src/components/ui/button";
import { Heading } from "@/src/components/ui/heading";
import { Suspense } from "react";

function SignupContent() {
  return (
    <div className="auth-canvas flex min-h-svh flex-col pb-8">
      <nav className="bg-background sticky top-0 z-20 flex shrink-0 items-center pt-[max(1rem,env(safe-area-inset-top))] pb-4">
        <ButtonLink
          href="/"
          variant="ghost"
          size="icon"
          shadowOn="background"
          className="sm:size-11"
          aria-label="Back to home"
          title="Back to home"
        >
          <Icon name="arrowLeft" size={20} />
        </ButtonLink>
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
            Create an account
          </Heading>
          <p className="text-muted mb-6 text-center text-sm">Sign up to start using Reodite — it&apos;s free</p>
          <Suspense fallback={<AuthFormLoading label="Loading sign up" />}>
            <AuthForm mode="signup" />
          </Suspense>
        </div>
      </div>
      <footer className="flex items-center justify-center pb-2">
        <ThemeToggle />
      </footer>
    </div>
  );
}

export default function SignupPage() {
  return <SignupContent />;
}
