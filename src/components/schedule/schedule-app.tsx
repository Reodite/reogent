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
import { defaultTermKey, deriveTerms, type Term } from "@/src/lib/schedule/features/terms";
import type { Avatar, DayCode, Person, Schedule, Section } from "@/src/lib/schedule/types";
import { dayCodeOf, minutesNow, minutesToFullLabel, toISODate } from "@/src/lib/schedule/util/time";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AvatarChip } from "./avatar-chip";
import { BlockDetail } from "./block-detail";
import { NowPanel } from "./now-panel";
import { PeoplePanel } from "./people-panel";
import { ScheduleGrid, type ScheduleGridEmptyState } from "./schedule-grid";
import { buildSharerBands, buildSharerGrid } from "./schedule-grid-adapter";
import { ScheduleWorkspace, type ScheduleWorkspaceView } from "./schedule-workspace";
import { TermSwitcher } from "./term-switcher";
import { ToastProvider, useToast } from "./toast";
import { UploadDropzone } from "./upload-dropzone";
import { useDialogFocus } from "./use-dialog-focus";

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
  const [mobileView, setMobileView] = useState<ScheduleWorkspaceView>("schedule");
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
  const enabledPeople = useMemo(() => people.filter((person) => person.enabled), [people]);
  const enabledPeopleWithSchedules = useMemo(() => enabledPeople.filter((person) => person.schedule), [enabledPeople]);
  const terms = useMemo(() => deriveTerms(people), [people]);
  const selectedTermKey =
    termKey && terms.some((term) => term.key === termKey) ? termKey : defaultTermKey(terms, toISODate(now));
  const term = terms.find((candidate) => candidate.key === selectedTermKey) ?? null;
  const calendar = useMemo(() => buildCalendar(enabledPeople, term), [enabledPeople, term]);
  const mergedBlocks = useMemo(() => [...calendar.blocksByDay.values()].flat(), [calendar.blocksByDay]);
  const grid = useMemo(() => buildSharerGrid(mergedBlocks), [mergedBlocks]);
  const freeBands = useMemo(() => {
    if (!showFree) return [];
    return enabledPeopleWithSchedules.length > 0
      ? commonFreeIntervals(expandBlocks(enabledPeopleWithSchedules, term), calendar.days)
      : [];
  }, [showFree, enabledPeopleWithSchedules, term, calendar.days]);
  const gridBands = useMemo(() => buildSharerBands(freeBands), [freeBands]);
  const termIsLive = !!term && toISODate(now) >= term.start && toISODate(now) <= term.end;

  function switchGroup(code: string) {
    setActiveCode(code);
    setTermKey(null);
    setEnabled({});
    router.push(`/pulse/schedule/${code}`);
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

  const nobodyImported = !!group && people.every((person) => !person.schedule);
  const allPeopleFiltered = !!group && people.length > 0 && people.every((person) => !person.enabled);
  const selectedSections = enabledPeopleWithSchedules
    .flatMap((person) => person.schedule?.sections ?? [])
    .filter((section) => sectionOverlapsTerm(section, term));
  const tbaOnly = selectedSections.length > 0 && selectedSections.every((section) => section.meetings.length === 0);
  const empty = scheduleEmptyState({
    group,
    groupError,
    me: me ? normalizePerson(me) : null,
    nobodyImported,
    allPeopleFiltered,
    tbaOnly,
    onImport: () => setMobileView("controls"),
    onCreate: () => setShowCreate(true),
  });
  const nowLine = termIsLive
    ? {
        day: dayCodeOf(now),
        minute: minutesNow(now),
        label: `Current time: ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
      }
    : undefined;

  const actions = (
    <>
      <button
        type="button"
        aria-label="Create a new shared schedule"
        onClick={() => setShowCreate(true)}
        className="neu-button text-on-surface flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium"
      >
        <Icon name="add" size={16} />
        New group
      </button>
      {activeCode ? (
        <button
          type="button"
          aria-label={`Copy share link ${activeCode}`}
          onClick={copyShareLink}
          className="neu-primary-button bg-primary text-on-primary flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium"
        >
          <Icon name="externalLink" size={16} />
          Share <span className="font-mono text-xs opacity-80">{activeCode}</span>
        </button>
      ) : null}
      {group ? (
        <button
          type="button"
          title={`Leave ${group.name}`}
          aria-label={`Leave ${group.name}`}
          onClick={leaveActiveGroup}
          className="neu-button text-muted hover:text-error flex size-10 items-center justify-center rounded-xl"
        >
          <Icon name="exit" size={17} />
        </button>
      ) : null}
    </>
  );

  const controls = (
    <div className="flex h-full min-h-0 [scrollbar-gutter:stable] flex-col gap-3 overflow-y-auto p-3">
      {groups.length > 0 ? (
        <section aria-labelledby="schedule-groups-heading">
          <label id="schedule-groups-heading" htmlFor="schedule-group" className="text-on-surface text-sm font-medium">
            Group
          </label>
          <select
            id="schedule-group"
            value={activeCode ?? ""}
            onChange={(event) => switchGroup(event.target.value)}
            className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 mt-2 min-h-11 w-full rounded-xl px-3 text-sm outline-none focus-visible:ring-2"
          >
            {groups.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name} · {item.memberCount}
              </option>
            ))}
          </select>
        </section>
      ) : null}

      {!group ? (
        <NoGroupControls
          me={me ? normalizePerson(me) : null}
          error={groupError}
          onUpload={(schedule) => setDraftSchedule(schedule)}
          onCreate={() => setShowCreate(true)}
          onJoin={switchGroup}
        />
      ) : (
        <>
          <UploadDropzone onParsed={(schedule) => setDraftSchedule(schedule)} />
          <PeoplePanel
            people={people}
            meId={me?.id ?? auth.user?.userId ?? null}
            onToggle={(id, value) => setEnabled((previous) => ({ ...previous, [id]: value }))}
            onEnableAll={() => setEnabled({})}
          />
          <section className="neu-panel rounded-2xl p-3">
            <label className="text-on-surface flex min-h-8 cursor-pointer items-center justify-between gap-3 text-sm font-medium">
              <span>Common free time</span>
              <input
                type="checkbox"
                checked={showFree}
                onChange={(event) => setShowFree(event.target.checked)}
                className="accent-primary size-4"
              />
            </label>
            {showFree && freeBands.length > 0 ? (
              <section
                aria-label="Common free-time intervals"
                className="text-on-surface-variant mt-2 flex flex-col gap-1 text-xs"
              >
                {freeBands.map((band) => (
                  <div key={`${band.day}-${band.startMin}`} className="flex justify-between gap-2">
                    <span>{band.day}</span>
                    <span className="font-mono tabular-nums">
                      {minutesToFullLabel(band.startMin)}–{minutesToFullLabel(band.endMin)}
                    </span>
                  </div>
                ))}
              </section>
            ) : null}
          </section>
          {termIsLive ? <NowPanel people={enabledPeople} now={now} /> : null}
        </>
      )}
    </div>
  );

  return (
    <>
      <ScheduleWorkspace
        title={group?.name ?? "Shared schedule"}
        description={
          group
            ? "Compare everyone’s week, find common free time, and open a class for details."
            : "Import your Workday schedule, then create or join a group to compare weeks."
        }
        actions={actions}
        toolbar={<TermSwitcher terms={terms} selected={selectedTermKey} onSelect={setTermKey} />}
        notice={
          groupLoading ? (
            <div role="status" className="text-muted px-1 text-sm">
              Opening shared schedule…
            </div>
          ) : undefined
        }
        controlsLabel="Controls"
        controls={controls}
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
      >
        <ScheduleGrid
          model={grid.model}
          activeDay={mobileDay}
          onActiveDayChange={setMobileDay}
          onBlockActivate={(id) => {
            const block = grid.blocksById.get(id);
            if (block) setDetail(block);
          }}
          bands={gridBands}
          now={nowLine}
          empty={empty}
          renderBlockFooter={(block) => {
            const peopleForBlock = grid.blocksById.get(block.id)?.people ?? [];
            return (
              <>
                {peopleForBlock.slice(0, 4).map((person) => (
                  <AvatarChip key={person.id} avatar={person.avatar} size={16} title={person.handle} />
                ))}
                {peopleForBlock.length > 4 ? (
                  <span className="text-on-surface-variant ml-0.5 font-mono text-xs">+{peopleForBlock.length - 4}</span>
                ) : null}
              </>
            );
          }}
          ariaLabel={group ? `${group.name} weekly schedule` : "Weekly schedule preview"}
        />
      </ScheduleWorkspace>
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
    </>
  );
}

function ScheduleLoading() {
  const [mobileView, setMobileView] = useState<ScheduleWorkspaceView>("schedule");
  const model = useMemo(() => buildSharerGrid([]).model, []);

  return (
    <ScheduleWorkspace
      title="Shared schedule"
      description="Loading your groups and saved Workday schedule."
      notice={
        <div role="status" className="text-muted flex items-center gap-2 px-1 text-sm">
          <span className="border-primary/25 border-t-primary size-4 animate-spin rounded-full border-2" />
          Loading schedules…
        </div>
      }
      controlsLabel="Controls"
      controls={<p className="text-muted p-4 text-sm">Your group and import controls are loading.</p>}
      mobileView={mobileView}
      onMobileViewChange={setMobileView}
    >
      <ScheduleGrid
        model={model}
        activeDay="Mon"
        onActiveDayChange={() => {}}
        onBlockActivate={() => {}}
        empty={{
          title: "Loading your week",
          description: "The timetable will stay here while your saved schedules arrive.",
        }}
      />
    </ScheduleWorkspace>
  );
}

function NoGroupControls({
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
    <div className="flex flex-col gap-4">
      <section>
        <h2 className="text-on-surface text-sm font-medium">
          {error ? "Group unavailable" : me ? "Start a group" : "Import from Workday"}
        </h2>
        <p className="text-muted mt-1 text-xs leading-relaxed">
          {error ||
            (me
              ? "Create a group for your schedule, or join one with its six-character code."
              : "Your Excel export is parsed in this browser before it is saved to Reodite.")}
        </p>
      </section>

      {!me ? (
        <UploadDropzone onParsed={onUpload} />
      ) : (
        <button
          type="button"
          onClick={onCreate}
          className="neu-primary-button bg-primary text-on-primary min-h-11 w-full rounded-xl px-4 text-sm font-medium"
        >
          Create a shared schedule
        </button>
      )}

      <form
        className="border-border-subtle flex flex-col gap-2 border-t pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (/^[0-9A-Za-z]{6}$/.test(code)) onJoin(code);
        }}
      >
        <label className="text-on-surface text-sm font-medium" htmlFor="schedule-code">
          Join with a code
        </label>
        <div className="flex gap-2">
          <input
            id="schedule-code"
            value={code}
            maxLength={6}
            placeholder="ABC123"
            aria-describedby="schedule-code-help"
            onChange={(event) => setCode(event.target.value.replace(/[^0-9A-Za-z]/g, ""))}
            className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 min-h-11 min-w-0 flex-1 rounded-xl px-3 text-center font-mono text-sm uppercase outline-none focus-visible:ring-2"
          />
          <button
            type="submit"
            disabled={!/^[0-9A-Za-z]{6}$/.test(code)}
            className="neu-button text-on-surface min-h-11 rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
          >
            Join
          </button>
        </div>
        <p id="schedule-code-help" className="text-muted text-xs">
          Enter the six-character code from a shared link.
        </p>
      </form>
    </div>
  );
}

function sectionOverlapsTerm(section: Section, term: Term | null): boolean {
  if (!term || !section.termStart || !section.termEnd) return true;
  return section.termStart <= term.end && section.termEnd >= term.start;
}

/** Describes why the shared grid is empty and the next available action. */
export function scheduleEmptyState({
  group,
  groupError,
  me,
  nobodyImported,
  allPeopleFiltered,
  tbaOnly,
  onImport,
  onCreate,
}: {
  group: GroupDetail | null;
  groupError: string;
  me: Person | null;
  nobodyImported: boolean;
  allPeopleFiltered: boolean;
  tbaOnly: boolean;
  onImport: () => void;
  onCreate: () => void;
}): ScheduleGridEmptyState {
  if (!group) {
    if (groupError) {
      return {
        title: "This group could not be opened",
        description: "Check the shared code or join a different group from Controls.",
        actionLabel: "Open controls",
        onAction: onImport,
      };
    }
    if (!me) {
      return {
        title: "Your empty week is ready",
        description: "Import your Workday schedule from Controls to put your classes on this grid.",
        actionLabel: "Import schedule",
        onAction: onImport,
      };
    }
    return {
      title: "No group selected",
      description: "Create a group or join one with a shared code. Your saved schedule stays unchanged.",
      actionLabel: "Create group",
      onAction: onCreate,
    };
  }
  if (nobodyImported) {
    return {
      title: "Nobody has imported a schedule",
      description: "Group members are here, but no one has added a Workday schedule yet.",
      actionLabel: "Import schedule",
      onAction: onImport,
    };
  }
  if (allPeopleFiltered) {
    return {
      title: "Everyone is hidden",
      description: "Turn someone back on in Controls to show their classes.",
      actionLabel: "Open people controls",
      onAction: onImport,
    };
  }
  if (tbaOnly) {
    return {
      title: "Meeting times are still TBA",
      description: "This term has sections, but Workday does not list a day or time for them yet.",
    };
  }
  return {
    title: "No classes in this term",
    description: "The selected people have no scheduled meetings in this term. Try another term above.",
  };
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
