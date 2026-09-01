"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { Icon } from "@/src/components/icons";
import type { MergedBlock } from "@/src/lib/schedule/calendar/buildCalendar";
import { buildCalendar, expandBlocks } from "@/src/lib/schedule/calendar/buildCalendar";
import {
  normalizePerson,
  sharerFetch,
  type GroupDetail,
  type GroupSummary,
  type WirePerson,
} from "@/src/lib/schedule/client";
import { commonFreeIntervals } from "@/src/lib/schedule/features/freeTime";
import { defaultTermKey, deriveTerms } from "@/src/lib/schedule/features/terms";
import type { Avatar, DayCode, Person, Schedule } from "@/src/lib/schedule/types";
import { dayCodeOf, minutesToFullLabel, toISODate } from "@/src/lib/schedule/util/time";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { BlockDetail } from "./block-detail";
import { NowPanel } from "./now-panel";
import { PeoplePanel } from "./people-panel";
import { TermSwitcher } from "./term-switcher";
import { ToastProvider, useToast } from "./toast";
import { UploadDropzone } from "./upload-dropzone";
import { useDialogFocus } from "./use-dialog-focus";
import { WeekGrid } from "./week-grid";

const ProfileModal = dynamic(() => import("./profile-modal").then((module) => module.ProfileModal));

interface Props {
  /** A 6-char group code from `/pulse/schedule/[code]`; opening it auto-joins the caller. */
  groupCode?: string;
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** Full DB-backed ScheduleSharer surface. */
export function ScheduleApp(props: Props) {
  return (
    <ToastProvider>
      <ScheduleAppInner {...props} />
    </ToastProvider>
  );
}

function ScheduleAppInner({ groupCode }: Props) {
  const auth = useAppAuth();
  const router = useRouter();
  const toast = useToast();
  const now = useNow();

  const [booting, setBooting] = useState(true);
  const [groupLoading, setGroupLoading] = useState(false);
  const [me, setMe] = useState<WirePerson | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [activeCode, setActiveCode] = useState<string | null>(groupCode ?? null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [groupError, setGroupError] = useState("");
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [termKey, setTermKey] = useState<string | null>(null);
  const [showFree, setShowFree] = useState(true);
  const [mobileDay, setMobileDay] = useState<DayCode>(() => {
    const day = dayCodeOf(new Date());
    return day === "Sat" || day === "Sun" ? "Mon" : day;
  });
  const [detail, setDetail] = useState<MergedBlock | null>(null);
  const [draftSchedule, setDraftSchedule] = useState<Schedule | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const request = useCallback(
    <T,>(path: string, init?: RequestInit) => sharerFetch<T>(auth.getToken, path, init),
    [auth.getToken],
  );

  const refreshGroups = useCallback(async () => {
    const result = await request<{ groups: GroupSummary[] }>("/groups");
    setGroups(result.groups);
    return result.groups;
  }, [request]);

  const fetchGroup = useCallback(
    async (code: string) => {
      // POST is an idempotent join. It covers a shared-link visit and normal
      // switching with one request instead of a separate membership probe.
      const result = await request<{ group: GroupDetail }>(`/groups/${code}`, { method: "POST" });
      return result.group;
    },
    [request],
  );

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const [personResult, groupResult] = await Promise.all([
          request<{ person: WirePerson | null }>("/schedule"),
          request<{ groups: GroupSummary[] }>("/groups"),
        ]);
        if (cancelled) return;
        setMe(personResult.person);
        setGroups(groupResult.groups);
        setActiveCode((current) => current ?? groupResult.groups[0]?.code ?? null);
      } catch (error) {
        if (!cancelled) toast(messageOf(error), "error");
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [request, toast]);

  useEffect(() => {
    if (groupCode) setActiveCode(groupCode);
  }, [groupCode]);

  useEffect(() => {
    if (!activeCode) return;
    let cancelled = false;
    const refreshVisibleGroup = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const [nextGroup] = await Promise.all([fetchGroup(activeCode), refreshGroups()]);
        if (!cancelled) setGroup(nextGroup);
      } catch {
        // Focus/poll refresh is best-effort; the visible data remains usable.
      }
    };
    const timer = window.setInterval(() => void refreshVisibleGroup(), 30_000);
    window.addEventListener("focus", refreshVisibleGroup);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisibleGroup);
    };
  }, [activeCode, fetchGroup, refreshGroups]);

  useEffect(() => {
    if (!activeCode) {
      setGroup(null);
      return;
    }
    let cancelled = false;
    setGroupLoading(true);
    Promise.all([fetchGroup(activeCode), refreshGroups()])
      .then(([nextGroup]) => {
        if (cancelled) return;
        setGroup(nextGroup);
        setGroupError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setGroup(null);
        setGroupError(messageOf(error));
      })
      .finally(() => !cancelled && setGroupLoading(false));
    return () => {
      cancelled = true;
    };
  }, [activeCode, fetchGroup, refreshGroups]);

  const people = useMemo(
    () => group?.members.map((person) => normalizePerson(person, enabled[person.id] ?? true)) ?? [],
    [group, enabled],
  );
  const terms = useMemo(() => deriveTerms(people), [people]);
  const selectedTermKey =
    termKey && terms.some((term) => term.key === termKey) ? termKey : defaultTermKey(terms, toISODate(now));
  const term = terms.find((candidate) => candidate.key === selectedTermKey) ?? null;
  const model = useMemo(() => buildCalendar(people, term), [people, term]);
  const hasBlocks = [...model.blocksByDay.values()].some((blocks) => blocks.length > 0);
  const freeBands = useMemo(() => {
    if (!showFree) return [];
    const visible = people.filter((person) => person.enabled && person.schedule);
    return visible.length > 0 ? commonFreeIntervals(expandBlocks(visible, term), model.days) : [];
  }, [showFree, people, term, model.days]);
  const termIsLive = !!term && toISODate(now) >= term.start && toISODate(now) <= term.end;

  function switchGroup(code: string) {
    setActiveCode(code);
    setTermKey(null);
    setEnabled({});
    router.push(`/pulse/schedule/${code}`);
  }

  function moveDayTab(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % model.days.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + model.days.length) % model.days.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = model.days.length - 1;
    else return;
    event.preventDefault();
    setMobileDay(model.days[next]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  async function saveSchedule(handle: string, avatar: Avatar) {
    if (!draftSchedule) return;
    try {
      const result = await request<{ person: WirePerson }>("/schedule", {
        method: "PUT",
        body: JSON.stringify({ handle, avatar, schedule: draftSchedule }),
      });
      setMe(result.person);
      setDraftSchedule(null);
      setGroup((current) => {
        if (!current || current.code !== activeCode) return current;
        const members = current.members.map((member) => (member.id === result.person.id ? result.person : member));
        return { ...current, members };
      });
      toast(`Saved ${handle}'s schedule · ${draftSchedule.sections.length} sections`);
    } catch (error) {
      toast(messageOf(error), "error");
    }
  }

  async function createGroup(name: string) {
    try {
      const result = await request<{ group: GroupDetail }>("/groups", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setShowCreate(false);
      await refreshGroups();
      switchGroup(result.group.code);
      toast(`Created “${result.group.name}”`);
    } catch (error) {
      toast(messageOf(error), "error");
    }
  }

  async function leaveActiveGroup() {
    if (!activeCode || !group) return;
    if (!window.confirm(`Leave “${group.name}”? The shared schedule stays available to everyone else.`)) return;
    try {
      await request(`/groups/${activeCode}`, { method: "DELETE" });
      const nextGroups = await refreshGroups();
      const next = nextGroups.find((candidate) => candidate.code !== activeCode);
      setGroup(null);
      setActiveCode(next?.code ?? null);
      if (next) router.replace(`/pulse/schedule/${next.code}`);
      else router.replace("/pulse/schedule");
      toast(`Left “${group.name}”`);
    } catch (error) {
      toast(messageOf(error), "error");
    }
  }

  async function copyShareLink() {
    if (!activeCode) return;
    const url = `${window.location.origin}/pulse/schedule/${activeCode}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(`Short link copied · ${activeCode}`);
    } catch {
      toast("Could not access the clipboard.", "error");
    }
  }

  if (booting) return <ScheduleLoading />;

  return (
    <section
      aria-label="Shared schedule"
      className="neu-panel flex min-h-0 w-full flex-col overflow-hidden rounded-2xl"
    >
      <header className="border-outline-variant/50 flex min-h-16 flex-wrap items-center gap-2 border-b px-3 py-2 max-lg:pl-12 sm:pr-4 lg:pl-4">
        <div className="mr-1 flex min-w-0 items-center gap-2">
          <span className="neu-button text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
            <Icon name="calendar" size={18} />
          </span>
          <div className="min-w-0">
            <h1 className="text-on-surface truncate text-sm font-medium">Student schedules</h1>
            <p className="text-muted hidden text-xs sm:block">One week for the whole crew</p>
          </div>
        </div>

        {groups.length > 0 && (
          <select
            aria-label="Shared schedule"
            value={activeCode ?? ""}
            onChange={(event) => switchGroup(event.target.value)}
            className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 min-h-10 max-w-48 rounded-xl px-3 text-sm font-medium outline-none focus-visible:ring-2"
          >
            {groups.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name} · {item.memberCount}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          aria-label="Create a new shared schedule"
          onClick={() => setShowCreate(true)}
          className="neu-button text-on-surface flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium"
        >
          <Icon name="add" size={16} />
          <span className="hidden sm:inline">New group</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <TermSwitcher terms={terms} selected={selectedTermKey} onSelect={setTermKey} />
          {activeCode && (
            <button
              type="button"
              aria-label={`Copy share link ${activeCode}`}
              onClick={copyShareLink}
              className="neu-primary-button bg-primary text-on-primary flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium"
            >
              <Icon name="externalLink" size={16} />
              <span className="hidden sm:inline">Copy link</span>
              <span className="font-mono text-[11px] opacity-80">{activeCode}</span>
            </button>
          )}
          {group && (
            <button
              type="button"
              title={`Leave ${group.name}`}
              aria-label={`Leave ${group.name}`}
              onClick={leaveActiveGroup}
              className="neu-button text-muted hover:text-error flex size-10 items-center justify-center rounded-xl"
            >
              <Icon name="exit" size={17} />
            </button>
          )}
        </div>
      </header>

      {groupLoading ? (
        <div className="text-muted flex flex-1 items-center justify-center text-sm">Opening shared schedule…</div>
      ) : group ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <aside className="border-outline-variant/50 bg-surface-container-low order-last flex w-full shrink-0 flex-col gap-3 border-b p-3 lg:order-none lg:h-full lg:w-72 lg:overflow-y-auto lg:border-r lg:border-b-0">
            <UploadDropzone onParsed={(schedule) => setDraftSchedule(schedule)} />
            <PeoplePanel
              people={people}
              meId={me?.id ?? auth.user?.userId ?? null}
              onToggle={(id, value) => setEnabled((prev) => ({ ...prev, [id]: value }))}
              onEnableAll={() => setEnabled({})}
            />
            <section className="neu-panel rounded-2xl p-3">
              <label className="text-on-surface flex min-h-8 cursor-pointer items-center justify-between gap-3 text-sm">
                <span>Common free time</span>
                <input
                  type="checkbox"
                  checked={showFree}
                  onChange={(event) => setShowFree(event.target.checked)}
                  className="accent-primary size-4"
                />
              </label>
              {showFree && freeBands.length > 0 && (
                <section
                  aria-label="Common free-time intervals"
                  className="text-on-surface-variant mt-2 flex flex-col gap-1 text-xs"
                >
                  {freeBands.map((band) => (
                    <div key={`${band.day}-${band.startMin}`} className="flex justify-between gap-2">
                      <span className="text-secondary font-medium">{band.day}</span>
                      <span className="font-mono tabular-nums">
                        {minutesToFullLabel(band.startMin)}–{minutesToFullLabel(band.endMin)}
                      </span>
                    </div>
                  ))}
                </section>
              )}
            </section>
            {termIsLive && <NowPanel people={people} now={now} />}
          </aside>

          <main className="bg-surface order-first min-w-0 shrink-0 overflow-visible p-2 sm:p-3 lg:order-none lg:min-h-0 lg:flex-1 lg:shrink lg:overflow-auto">
            {hasBlocks ? (
              <>
                <div
                  className="bg-surface sticky top-0 z-20 mb-2 flex gap-1 py-1 md:hidden"
                  role="tablist"
                  aria-label="Day"
                >
                  {model.days.map((day, index) => (
                    <button
                      key={day}
                      type="button"
                      role="tab"
                      tabIndex={day === mobileDay ? 0 : -1}
                      aria-selected={day === mobileDay}
                      onClick={() => setMobileDay(day)}
                      onKeyDown={(event) => moveDayTab(event, index)}
                      className={`min-h-9 flex-1 rounded-lg text-xs font-medium ${
                        day === mobileDay ? "neu-button text-primary" : "text-on-surface-variant"
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <div className="neu-inset bg-surface-container-low min-w-[320px] overflow-hidden rounded-2xl">
                  <WeekGrid
                    model={model}
                    freeBands={freeBands}
                    now={now}
                    termIsLive={termIsLive}
                    activeDay={mobileDay}
                    onBlockClick={setDetail}
                  />
                </div>
              </>
            ) : (
              <CalendarEmpty people={people} />
            )}
          </main>
        </div>
      ) : (
        <NoGroup
          me={me ? normalizePerson(me) : null}
          error={groupError}
          onUpload={(schedule) => setDraftSchedule(schedule)}
          onCreate={() => setShowCreate(true)}
          onJoin={(code) => switchGroup(code)}
        />
      )}

      {draftSchedule && (
        <ProfileModal
          schedule={draftSchedule}
          currentHandle={me?.handle}
          currentAvatar={me ? normalizePerson(me).avatar : undefined}
          title={me ? "Replace your schedule" : "Who is this schedule for?"}
          saveLabel={me ? "Replace schedule" : "Save my schedule"}
          onSave={saveSchedule}
          onCancel={() => setDraftSchedule(null)}
        />
      )}
      {showCreate && <CreateGroupModal onCreate={createGroup} onClose={() => setShowCreate(false)} />}
      {detail && <BlockDetail block={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}

function ScheduleLoading() {
  return (
    <section className="neu-panel flex min-h-72 w-full items-center justify-center rounded-2xl">
      <div className="text-muted flex items-center gap-2 text-sm">
        <span className="border-primary/25 border-t-primary size-4 animate-spin rounded-full border-2" />
        Loading schedules…
      </div>
    </section>
  );
}

function NoGroup({
  me,
  error,
  onUpload,
  onCreate,
  onJoin,
}: {
  me: Person | null;
  error: string;
  onUpload: (schedule: Schedule) => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 sm:p-8">
      <div className="w-full max-w-xl">
        <div className="mb-5 text-center">
          <span className="neu-button text-primary mx-auto flex size-12 items-center justify-center rounded-2xl">
            <Icon name="group" size={24} />
          </span>
          <h2 className="text-on-surface mt-3 text-xl font-medium">
            {error
              ? "That schedule is unavailable"
              : me
                ? "Bring your schedules together"
                : "Start with your Workday schedule"}
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            {error ||
              (me
                ? "Create a group, copy its six-character link, and everyone you invite appears in the same week."
                : "Your .xlsx is parsed in this browser, then saved to your Reodite account.")}
          </p>
        </div>

        {!me ? (
          <UploadDropzone hero onParsed={onUpload} />
        ) : (
          <button
            type="button"
            onClick={onCreate}
            className="neu-primary-button bg-primary text-on-primary min-h-12 w-full rounded-xl px-5 text-sm font-medium"
          >
            Create a shared schedule
          </button>
        )}

        <form
          className="mt-4 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (/^[0-9A-Za-z]{6}$/.test(code)) onJoin(code);
          }}
        >
          <div className="bg-outline-variant/60 h-px flex-1" />
          <label className="sr-only" htmlFor="schedule-code">
            Six-character schedule code
          </label>
          <input
            id="schedule-code"
            value={code}
            maxLength={6}
            placeholder="ABC123"
            onChange={(event) => setCode(event.target.value.replace(/[^0-9A-Za-z]/g, ""))}
            className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 min-h-10 w-28 rounded-xl px-3 text-center font-mono text-sm tracking-widest outline-none focus-visible:ring-2"
          />
          <button
            type="submit"
            disabled={!/^[0-9A-Za-z]{6}$/.test(code)}
            className="neu-button text-on-surface min-h-10 rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
          >
            Join
          </button>
          <div className="bg-outline-variant/60 h-px flex-1" />
        </form>
      </div>
    </div>
  );
}

function CalendarEmpty({ people }: { people: Person[] }) {
  const waiting = people.length > 0 && people.every((person) => !person.schedule);
  return (
    <div className="border-outline-variant flex min-h-72 items-center justify-center rounded-2xl border border-dashed p-6 text-center">
      <div>
        <Icon name="calendar" size={28} className="text-muted mx-auto" />
        <p className="text-on-surface mt-2 text-sm font-medium">
          {waiting ? "Waiting for someone to add a schedule" : "No classes in this term"}
        </p>
        <p className="text-on-surface-variant mt-1 text-xs">
          {waiting ? "Add yours from the upload area." : "Try another term from the top bar."}
        </p>
      </div>
    </div>
  );
}

export function CreateGroupModal({
  onCreate,
  onClose,
}: {
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const dialogRef = useDialogFocus<HTMLFormElement>();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !creating && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creating, onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel new shared schedule"
        tabIndex={-1}
        disabled={creating}
        onClick={onClose}
        className="bg-on-surface/20 absolute inset-0 cursor-default"
      />
      <form
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label="Create shared schedule"
        aria-busy={creating}
        className="neu-panel relative w-full max-w-sm rounded-2xl p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim() || creating) return;
          setCreating(true);
          try {
            await onCreate(name.trim());
          } finally {
            setCreating(false);
          }
        }}
      >
        <h2 className="text-on-surface text-base font-medium">Create a shared schedule</h2>
        <p className="text-on-surface-variant mt-1 text-sm">Name it for the group chat, club, or study crew.</p>
        <label className="mt-4 flex flex-col gap-1">
          <span className="text-muted text-xs font-medium">Group name</span>
          <input
            data-dialog-initial-focus
            value={name}
            disabled={creating}
            maxLength={80}
            placeholder="CPSC study crew"
            onChange={(event) => setName(event.target.value)}
            className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 min-h-11 rounded-xl px-3 text-sm outline-none focus-visible:ring-2"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={creating}
            onClick={onClose}
            className="neu-button text-on-surface-variant min-h-10 rounded-xl px-4 text-sm disabled:opacity-45"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="neu-primary-button bg-primary text-on-primary min-h-10 rounded-xl px-4 text-sm font-medium disabled:opacity-45"
          >
            {creating ? "Creating…" : "Create group"}
          </button>
        </div>
      </form>
    </div>
  );
}
