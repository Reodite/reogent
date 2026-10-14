"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { ProfileFields } from "@/src/components/auth/profile-fields";
import { Icon } from "@/src/components/icons";
import { useApi, useProfile, useTheme } from "@/src/components/providers";
import { Button, ButtonLink } from "@/src/components/ui/button";
import { RetryState } from "@/src/components/ui/feedback";
import { Heading } from "@/src/components/ui/heading";
import { Skeleton, SkeletonGroup } from "@/src/components/ui/skeleton";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";
import { parseProfile, type AccountDetails, type StudentProfile } from "@/src/shared/profile";
import { useEffect, useRef, useState, type FormEvent } from "react";

const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "long" });
const numberFormat = new Intl.NumberFormat("en-CA");

type AccountState = { status: "loading" | "error" } | { status: "loaded"; details: AccountDetails };

function AccountContent({ account }: { account: AccountDetails }) {
  const { saveProfile } = useProfile();
  const { mode } = useTheme();
  const [profile, setProfile] = useState(account.profile);
  const [draft, setDraft] = useState<StudentProfile | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedMode, setSavedMode] = useState(mode);
  const formRef = useRef<HTMLFormElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const editing = draft !== null;
  const saving = status === "saving";
  const saved = status === "saved" && savedMode === mode;
  const name = profile?.preferred_name || account.username;
  const fields = [
    ["Preferred name", profile?.preferred_name || "Not set"],
    ["Program", profile?.program || "Not set"],
    ["Year of study", profile?.year?.toString() || "Not set"],
    [
      "Tuition defaults",
      profile?.student_type === "domestic"
        ? "Domestic student"
        : profile?.student_type === "international"
          ? "International student"
          : "Ask me when needed",
    ],
  ];

  useEffect(() => {
    if (editing) formRef.current?.querySelector("input")?.focus();
  }, [editing]);

  useEffect(() => {
    if (status === "saved" && document.activeElement === document.body) editRef.current?.focus();
  }, [status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    setStatus("saving");
    try {
      const parsed = parseProfile({ ...draft, theme: mode });
      if (!parsed.ok) throw new Error(parsed.error);
      await saveProfile(parsed.value);
      setSavedMode(mode);
      setProfile(parsed.value);
      setDraft(null);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="bg-primary-container text-on-primary-container flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-medium"
        >
          {name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <Heading as="h2" size="section" className="wrap-anywhere">
            {name}
          </Heading>
          <p className="text-muted mt-1 text-sm wrap-anywhere">@{account.username}</p>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Account created</dt>
        <dd className="text-on-surface">
          {account.createdAt ? (
            <time dateTime={account.createdAt}>{dateFormat.format(new Date(account.createdAt))}</time>
          ) : (
            "Not available"
          )}
        </dd>
      </dl>
      <section aria-labelledby="account-profile-title" className="border-border-subtle border-t pt-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Heading as="h2" size="section" id="account-profile-title">
            Student profile
          </Heading>
          <Button
            ref={editRef}
            variant="ghost"
            size="compact"
            disabled={saving}
            aria-expanded={editing}
            aria-controls={editing ? "account-profile-form" : undefined}
            onClick={() => {
              setDraft(editing ? null : (profile ?? {}));
              setStatus("idle");
            }}
          >
            {!editing && <Icon name="pencil" size={14} />}
            {editing ? "Cancel" : "Edit profile"}
          </Button>
        </header>
        {draft ? (
          <form
            ref={formRef}
            id="account-profile-form"
            onSubmit={handleSubmit}
            aria-busy={saving}
            className="ui-content-enter flex flex-col gap-3"
          >
            <fieldset disabled={saving} className="flex flex-col gap-3 disabled:opacity-70">
              <ProfileFields
                profile={draft}
                onChange={(next) => {
                  setDraft(next);
                  setStatus("idle");
                }}
                shadowOn="surface-container-low"
              />
              <Button type="submit" variant="primary" size="prominent" className="self-start">
                <Icon name="check" size={16} />
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </fieldset>
            <p className="text-muted text-xs">
              The assistant uses these defaults for tuition, cost, and program questions.
            </p>
          </form>
        ) : (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map(([label, value]) => (
              <div key={label} className="min-w-0 space-y-1">
                <dt className="text-muted text-xs">{label}</dt>
                <dd className="text-on-surface text-sm wrap-anywhere">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p role="status" className={`text-xs ${status === "error" ? "text-error" : "text-muted"}`}>
          {saved || status === "error" ? (
            <span key={status} className="ui-notice-enter mt-3 block">
              {saved ? "Saved" : "Couldn't save. Try again."}
            </span>
          ) : null}
        </p>
      </section>
      <section aria-labelledby="account-activity-title" className="border-border-subtle border-t pt-6">
        <Heading as="h2" size="section" id="account-activity-title" className="mb-4">
          Activity
        </Heading>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { label: "Tokens spent", value: account.tokensSpent },
            { label: "Pulse questions answered", value: account.pulseQuestionsAnswered },
          ].map(({ label, value }) => (
            <div key={label} className="min-w-0 space-y-1">
              <dt className="text-muted text-xs">{label}</dt>
              <dd className="text-on-surface text-sm font-medium tabular-nums">{numberFormat.format(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted mt-4 text-xs leading-relaxed">
          Provider-reported tokens include chat and conversation titles. Tracked since{" "}
          <time dateTime={account.tokenTrackingStartedAt}>
            {dateFormat.format(new Date(account.tokenTrackingStartedAt))}
          </time>
          . Earlier usage is unavailable.
        </p>
      </section>
    </>
  );
}

export default function AccountPage() {
  const auth = useAppAuth();
  const api = useApi();
  const [state, setState] = useState<AccountState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [signOutError, setSignOutError] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt starts an explicit retry.
  useEffect(() => {
    if (auth.isGuest) return;
    let active = true;
    setState({ status: "loading" });
    void api.getAccount().then(
      (details) => {
        if (active) setState({ status: "loaded", details });
      },
      () => {
        if (active) setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [api, auth.isGuest, attempt]);

  function signOut() {
    setSignOutError(false);
    try {
      auth.signOut();
    } catch {
      setSignOutError(true);
    }
  }

  return (
    <WorkspacePage composition="single" title="Account" description="Your details and activity in Reodite.">
      <WorkspaceCanvas padding="md">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          {auth.isGuest ? (
            <div className="flex flex-col items-start gap-3">
              <Heading as="h2" size="section">
                Guest session
              </Heading>
              <p className="text-on-surface-variant text-sm">Sign in to save your profile and track your activity.</p>
              <ButtonLink href="/login?redirect=%2Faccount" variant="primary" size="field">
                Sign in
              </ButtonLink>
            </div>
          ) : state.status === "loaded" ? (
            <AccountContent account={state.details} />
          ) : state.status === "error" ? (
            <RetryState
              title="Account details unavailable"
              message="Couldn't load your profile and activity. Try again."
              onRetry={() => setAttempt((value) => value + 1)}
              align="start"
              compact
            />
          ) : (
            <SkeletonGroup label="Loading account details" className="flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-full" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <Skeleton className="h-5 w-56 max-w-full" />
              {["profile", "activity"].map((section) => (
                <div key={section} className="border-border-subtle flex flex-col gap-4 border-t pt-6">
                  <Skeleton className="h-5 w-28" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {(section === "profile" ? ["name", "program", "year", "tuition"] : ["tokens", "pulse"]).map(
                      (field) => (
                        <div key={field} className="flex flex-col gap-2">
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="h-5 w-36 max-w-full" />
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </SkeletonGroup>
          )}
          <div className="border-border-subtle flex flex-col items-start gap-3 border-t pt-6">
            <Button variant="danger" size="field" shadowOn="surface-container-low" onClick={signOut}>
              <Icon name="exit" size={16} />
              Sign out
            </Button>
            {signOutError ? (
              <p role="alert" className="text-error text-sm">
                Couldn't sign out. Try again.
              </p>
            ) : null}
          </div>
        </div>
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}
