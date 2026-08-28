"use client";

// Standalone settings page (outside the shell, like /login): account details
// and preferences. Signed-out visitors are sent to /login.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { Icon } from "@/src/components/icons";
import { ThemeToggle } from "@/src/components/theme-toggle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

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
