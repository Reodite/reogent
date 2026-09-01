// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateGroupModal, ScheduleApp, scheduleEmptyState } from "./schedule-app";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const getToken = vi.hoisted(() => vi.fn(async () => "token"));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({
    getToken,
    user: { userId: "u1", username: "ada" },
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function CreateDialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open create
      </button>
      {open && <CreateGroupModal onCreate={async () => {}} onClose={() => setOpen(false)} />}
    </>
  );
}

describe("CreateGroupModal", () => {
  it("traps initial focus and restores the trigger on close", async () => {
    render(<CreateDialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open create" });
    trigger.focus();
    fireEvent.click(trigger);
    const input = screen.getByLabelText("Group name");
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(trigger);
  });

  it("allows only one create request while submission is pending", async () => {
    let finish: (() => void) | undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<CreateGroupModal onCreate={onCreate} onClose={vi.fn()} />);

    const input = screen.getByLabelText("Group name");
    fireEvent.change(input, { target: { value: "Study crew" } });
    const form = input.closest("form");
    if (!form) throw new Error("create form not rendered");
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Creating…" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => finish?.());
    expect((screen.getByRole("button", { name: "Create group" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("ScheduleApp empty states", () => {
  const group = { code: "ABC123", name: "Study group", createdBy: "u1", createdAt: "x", members: [] };
  const base = {
    group,
    groupError: "",
    me: null,
    nobodyImported: false,
    allPeopleFiltered: false,
    tbaOnly: false,
    onImport: vi.fn(),
    onCreate: vi.fn(),
  };

  it("keeps no-group, unimported, filtered, TBA, and empty-term copy distinct", () => {
    expect(scheduleEmptyState({ ...base, group: null }).title).toBe("Your empty week is ready");
    expect(scheduleEmptyState({ ...base, nobodyImported: true }).title).toBe("Nobody has imported a schedule");
    expect(scheduleEmptyState({ ...base, allPeopleFiltered: true }).title).toBe("Everyone is hidden");
    expect(scheduleEmptyState({ ...base, tbaOnly: true }).title).toBe("Meeting times are still TBA");
    expect(scheduleEmptyState(base).title).toBe("No classes in this term");
  });
});

const summaries = [
  { code: "AAAAAA", name: "Group A", memberCount: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
  { code: "BBBBBB", name: "Group B", memberCount: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
  { code: "CCCCCC", name: "Group C", memberCount: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
];

const schedule = {
  importedAt: "2026-01-01T00:00:00.000Z",
  sections: [
    {
      id: "cpsc-110",
      courseCode: "CPSC 110",
      title: "Computation, Programs, and Programming",
      component: "Lecture",
      instructors: [],
      termStart: "2026-01-01",
      termEnd: "2026-12-31",
      meetings: [{ days: ["Mon"], startMin: 540, endMin: 600, raw: "" }],
    },
  ],
};

function wirePerson(id: string, handle: string, imported = true) {
  return {
    id,
    handle,
    avatar: { kind: "initials", initials: handle[0]?.toUpperCase() ?? "?", color: "#6ea8fe" },
    schedule: imported ? schedule : null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function group(code: string, name: string, members = [wirePerson("u1", name.replace("Group ", "Person "))]) {
  return { code, name, createdBy: "u1", createdAt: "x", members };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function stubSharerFetch({
  me = wirePerson("u1", "Ada"),
  groups = summaries,
  loadGroup,
}: {
  me?: ReturnType<typeof wirePerson> | null;
  groups?: typeof summaries;
  loadGroup: (code: string) => Promise<Response>;
}) {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/schedule")) return Promise.resolve(json({ person: me }));
    if (url.endsWith("/groups") && !init?.method) return Promise.resolve(json({ groups }));
    const match = url.match(/\/groups\/([0-9A-Za-z]{6})$/);
    if (match?.[1] && (init?.method === "POST" || init?.method === "GET")) return loadGroup(match[1]);
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function controlOrder(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-control-section]"))
    .filter((element) => !element.parentElement?.closest("[data-control-section]"))
    .map((element) => element.getAttribute("data-control-section"));
}

describe("ScheduleApp group loading", () => {
  it("shows the shared week immediately and defaults mobile to Schedule", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/schedule")) return Promise.resolve(json({ person: null }));
        if (url.endsWith("/groups")) return Promise.resolve(json({ groups: [] }));
        throw new Error(`unexpected request: ${url}`);
      }),
    );

    const view = render(
      <main data-pane="unity">
        <ScheduleApp />
      </main>,
    );

    expect(await screen.findByText("Your empty week is ready")).toBeTruthy();
    expect(view.container.querySelector<HTMLElement>("[data-schedule-host]")?.dataset.scheduleHost).toBe("unity");
    expect(screen.getAllByText("Mon").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Schedule" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Controls" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("clears Group A content as soon as Group B is selected, then shows a keyed failure", async () => {
    const pendingB = deferredResponse();
    stubSharerFetch({
      loadGroup: (code) =>
        code === "AAAAAA" ? Promise.resolve(json({ group: group("AAAAAA", "Group A") })) : pendingB.promise,
    });

    render(<ScheduleApp groupCode="AAAAAA" />);
    expect(await screen.findAllByText("Person A")).not.toHaveLength(0);

    fireEvent.change(screen.getByRole("combobox", { name: "Group" }), { target: { value: "BBBBBB" } });

    expect(screen.getByRole("heading", { name: "Group B" })).toBeTruthy();
    expect(screen.getAllByText("Opening Group B…")).not.toHaveLength(0);
    expect(screen.getByText("Opening Group B")).toBeTruthy();
    expect(screen.queryAllByText("Person A")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Copy share link/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Leave" })).toBeNull();

    await act(async () => pendingB.resolve(json({ error: "Invitation expired" }, 410)));
    expect(await screen.findByRole("heading", { name: "Group B unavailable" })).toBeTruthy();
    expect(screen.getByText(/Group BBBBBB could not be opened.*Invitation expired/)).toBeTruthy();
    expect(screen.queryAllByText("Person A")).toHaveLength(0);
  });

  it("accepts only Group C during a rapid A to B to C switch", async () => {
    const pendingB = deferredResponse();
    stubSharerFetch({
      loadGroup: (code) => {
        if (code === "AAAAAA") return Promise.resolve(json({ group: group(code, "Group A") }));
        if (code === "BBBBBB") return pendingB.promise;
        return Promise.resolve(json({ group: group(code, "Group C") }));
      },
    });

    render(<ScheduleApp groupCode="AAAAAA" />);
    await screen.findAllByText("Person A");
    fireEvent.change(screen.getByRole("combobox", { name: "Group" }), { target: { value: "BBBBBB" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Group" }), { target: { value: "CCCCCC" } });
    expect(await screen.findAllByText("Person C")).not.toHaveLength(0);

    await act(async () => pendingB.resolve(json({ group: group("BBBBBB", "Late Group B") })));
    expect(screen.getByRole("heading", { name: "Group C" })).toBeTruthy();
    expect(screen.queryByText("Late Group B")).toBeNull();
    expect(screen.queryAllByText("Person B")).toHaveLength(0);
  });

  it("does not let a focus refresh replace a newly selected group", async () => {
    const refreshA = deferredResponse();
    let requestsForA = 0;
    const fetchMock = stubSharerFetch({
      loadGroup: (code) => {
        if (code === "AAAAAA" && requestsForA++ > 0) return refreshA.promise;
        return Promise.resolve(json({ group: group(code, code === "AAAAAA" ? "Group A" : "Group B") }));
      },
    });

    render(<ScheduleApp groupCode="AAAAAA" />);
    await screen.findAllByText("Person A");
    fireEvent.focus(window);
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/groups/AAAAAA"))).toHaveLength(2),
    );
    const refreshCall = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/groups/AAAAAA"))[1];
    expect(refreshCall[1]?.method).toBe("GET");

    fireEvent.change(screen.getByRole("combobox", { name: "Group" }), { target: { value: "BBBBBB" } });
    expect(await screen.findAllByText("Person B")).not.toHaveLength(0);
    await act(async () => refreshA.resolve(json({ group: group("AAAAAA", "Refreshed Group A") })));

    expect(screen.getByRole("heading", { name: "Group B" })).toBeTruthy();
    expect(screen.queryByText("Refreshed Group A")).toBeNull();
  });
});

describe("ScheduleApp controls", () => {
  it("keeps Share as the only header action and renders ready controls in order", async () => {
    stubSharerFetch({ loadGroup: (code) => Promise.resolve(json({ group: group(code, "Group A") })) });
    const view = render(<ScheduleApp groupCode="AAAAAA" />);
    const share = await screen.findByRole("button", { name: "Copy share link AAAAAA" });
    const actionContainer = share.parentElement;

    expect(actionContainer?.querySelectorAll("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "New group" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leave" })).toBeTruthy();
    expect(controlOrder(view.container)).toEqual(["group", "management", "people", "free-time", "now", "import"]);
    expect(view.container.querySelector("[data-control-section] .neu-panel")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Group" }).className).toContain("rounded-lg");
    expect(screen.getByText("Replace my schedule")).toBeTruthy();
  });

  it("moves import directly after management when my schedule is incomplete", async () => {
    const me = wirePerson("u1", "Ada", false);
    stubSharerFetch({
      me,
      loadGroup: (code) => Promise.resolve(json({ group: group(code, "Group A", [me, wirePerson("u2", "Grace")]) })),
    });
    const view = render(<ScheduleApp groupCode="AAAAAA" />);
    await screen.findByRole("button", { name: "Leave" });

    expect(controlOrder(view.container)).toEqual(["group", "management", "import", "people", "free-time", "now"]);
    expect(screen.getByText("Import my schedule")).toBeTruthy();
  });

  it("uses flat, capped free-time states and all enabled-person derivatives", async () => {
    stubSharerFetch({ loadGroup: (code) => Promise.resolve(json({ group: group(code, "Group A") })) });
    const view = render(<ScheduleApp groupCode="AAAAAA" />);
    const personToggle = await screen.findByRole("checkbox", { name: "Show Person A on the calendar" });
    const freeSection = view.container.querySelector('[data-control-section="free-time"]');

    expect(freeSection?.querySelector('[aria-label="Common free-time intervals"]')).toBeTruthy();
    expect(freeSection?.querySelector(".max-h-36.overflow-y-auto")).toBeTruthy();
    expect(freeSection?.className).not.toContain("neu-panel");
    expect(freeSection?.className).not.toContain("secondary");

    const nowSection = view.container.querySelector('[data-control-section="now"]');
    expect(nowSection?.textContent).toContain("Person A");

    fireEvent.click(personToggle);
    expect(screen.getByText("Show at least one person with a schedule to compare free time.")).toBeTruthy();
    expect(nowSection?.textContent).not.toContain("Person A");
  });

  it("distinguishes enabled schedules with no common interval", async () => {
    const busySchedule = {
      ...schedule,
      sections: [
        {
          ...schedule.sections[0],
          meetings: [{ days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startMin: 480, endMin: 1200, raw: "" }],
        },
      ],
    };
    const ada = { ...wirePerson("u1", "Ada"), schedule: busySchedule };
    stubSharerFetch({
      me: ada,
      loadGroup: (code) => Promise.resolve(json({ group: group(code, "Group A", [ada]) })),
    });

    render(<ScheduleApp groupCode="AAAAAA" />);
    expect(await screen.findByText("The enabled schedules have no common interval in this timetable.")).toBeTruthy();
  });
});
