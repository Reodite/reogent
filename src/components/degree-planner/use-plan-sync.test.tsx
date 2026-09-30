// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { Storage } from "happy-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const browserStorage = new Storage();
let store: typeof import("./planner-store");
let scheduleStore: typeof import("../schedule-planner/schedule-store");
let useScheduleSync: typeof import("../schedule-planner/use-schedule-sync").useScheduleSync;
let usePlanSync: typeof import("./use-plan-sync").usePlanSync;
let AppProviders: typeof import("../providers").AppProviders;
let useApi: typeof import("../providers").useApi;
let useAppAuth: typeof import("../auth/app-auth").useAppAuth;
let auth: ReturnType<typeof useAppAuth>;
let api: ReturnType<typeof useApi>;
const writes: { token: string | null; plan: unknown }[] = [];
const reads: string[] = [];
const renders: { userId: string | undefined; plan: string }[] = [];
let getPlan: (token: string) => Promise<Response>;
let getSchedule: (token: string) => Promise<Response>;
const scheduleReads: string[] = [];
const scheduleWrites: { token: string | null; schedule: unknown }[] = [];
const scheduleRenders: { userId: string | undefined; schedule: string }[] = [];

function token(userId: string) {
  return `header.${btoa(JSON.stringify({ sub: userId, exp: 4_000_000_000 }))}.signature`;
}

function storedLogin(userId: string) {
  localStorage.setItem("reodite.auth.token", token(userId));
  localStorage.setItem("reodite.auth.user", JSON.stringify({ userId, username: userId }));
}

function storageEvent(key: string | null = "reodite.auth.user") {
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function seedPlan(ownerId: string | null, code = "PRIVATE 101") {
  const plan = store.migratePersistedPlan({
    years: [{ id: "private-year", terms: [{ season: "w1", blocks: [{ id: "private-block", code }] }] }],
    faculty: "Private Faculty",
    lookupQuery: "Private lookup",
    checkedRequirements: ["private-requirement"],
  });
  store.usePlanner.setState({
    ...plan,
    ownerId,
    flashBlockId: "private-block",
    past: [{ years: plan.years, ignoredBlocks: [], checkedRequirements: [] }],
    future: [{ years: plan.years, ignoredBlocks: [], checkedRequirements: [] }],
  });
}

function Board() {
  usePlanSync();
  const state = store.usePlanner();
  const currentAuth = useAppAuth();
  const plan = JSON.stringify(store.persistedSlice(state));
  renders.push({ userId: currentAuth.user?.userId, plan });
  return <output>{plan}</output>;
}

function ScheduleBoard() {
  useScheduleSync();
  const state = scheduleStore.useSchedule();
  const currentAuth = useAppAuth();
  const schedule = JSON.stringify(state);
  scheduleRenders.push({ userId: currentAuth.user?.userId, schedule });
  return <output>{schedule}</output>;
}

function Probe({ showPlan = true, showSchedule = false }: { showPlan?: boolean; showSchedule?: boolean }) {
  auth = useAppAuth();
  api = useApi();
  return auth.status === "signedIn" ? (
    <>
      {showPlan && <Board />}
      {showSchedule && <ScheduleBoard />}
    </>
  ) : null;
}

function App({ showPlan = true, showSchedule = false }: { showPlan?: boolean; showSchedule?: boolean }) {
  return (
    <AppProviders>
      <Probe showPlan={showPlan} showSchedule={showSchedule} />
    </AppProviders>
  );
}

async function login(userId: string) {
  await act(async () => {
    expect(await auth.signIn(userId, "password")).toEqual({});
  });
}

beforeAll(async () => {
  vi.stubGlobal("localStorage", browserStorage);
  store = await import("./planner-store");
  scheduleStore = await import("../schedule-planner/schedule-store");
  ({ useScheduleSync } = await import("../schedule-planner/use-schedule-sync"));
  ({ usePlanSync } = await import("./use-plan-sync"));
  ({ AppProviders, useApi } = await import("../providers"));
  ({ useAppAuth } = await import("../auth/app-auth"));
});

beforeEach(() => {
  localStorage.clear();
  store.usePlanner.setState({ ...store.usePlanner.getInitialState(), ownerId: null });
  scheduleStore.useSchedule.setState(scheduleStore.useSchedule.getInitialState());
  scheduleReads.length = 0;
  scheduleWrites.length = 0;
  scheduleRenders.length = 0;
  getSchedule = async () => Response.json({ schedule: null });
  writes.length = 0;
  reads.length = 0;
  renders.length = 0;
  getPlan = async () => Response.json({ plan: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("Authorization");
      if (path.startsWith("/api/auth/")) {
        const { username } = JSON.parse(init?.body as string);
        return Response.json({ userId: username, username, token: token(username) });
      }
      if (path === "/api/plan" && init?.method === "PUT") {
        writes.push({ token: authorization, plan: JSON.parse(init.body as string) });
        return new Response(null, { status: 204 });
      }
      if (path === "/api/plan") {
        reads.push(authorization!);
        return getPlan(authorization!);
      }
      if (path === "/api/schedule" && init?.method === "PUT") {
        scheduleWrites.push({ token: authorization, schedule: JSON.parse(init.body as string) });
        return new Response(null, { status: 204 });
      }
      if (path === "/api/schedule") {
        scheduleReads.push(authorization!);
        return getSchedule(authorization!);
      }
      if (path.startsWith("/api/courses/"))
        return Response.json({
          code: "CPSC 110",
          title: "Server course",
          sections: [{ section: "101", term: "term-1", days: ["m"], start_time: "09:00", end_time: "10:00" }],
        });
      throw new Error(`Unexpected request: ${path}`);
    }),
  );
});

afterEach(async () => {
  await act(async () => cleanup());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", browserStorage);
});

describe("schedule account privacy with real auth and storage", () => {
  function seedSchedule(ownerId: string) {
    scheduleStore.useSchedule.setState({
      ownerId,
      dirty: true,
      revision: 10,
      activeTerm: "private term",
      selectedComponents: ["private selection"],
      entries: [
        {
          code: "PRIVATE 101",
          section: "101",
          term: "private term",
          snapshot: {
            title: "Private snapshot",
            instructor: null,
            days: ["m"],
            start_time: "09:00",
            end_time: "10:00",
            status: null,
          },
        },
      ],
    });
  }

  it.each(["reload", "cross-tab"])("clears A's schedule before B renders on %s", async (transition) => {
    const response = deferred<Response>();
    getSchedule = () => response.promise;
    if (transition === "cross-tab") {
      storedLogin("schedule-A");
      render(<App showPlan={false} showSchedule />);
    }
    act(() => seedSchedule("schedule-A"));
    act(() => {
      storedLogin("schedule-B");
      storageEvent();
    });
    if (transition === "reload") render(<App showPlan={false} showSchedule />);
    const bRenders = scheduleRenders.filter((entry) => entry.userId === "schedule-B");
    expect(bRenders.length).toBeGreaterThan(0);
    expect(JSON.stringify(bRenders)).not.toContain("PRIVATE");
    expect(scheduleStore.useSchedule.getState()).toMatchObject({
      ownerId: "schedule-B",
      entries: [],
      selectedComponents: [],
      dirty: false,
    });
    await act(async () => response.resolve(Response.json({ schedule: null })));
    await act(async () => cleanup());
    expect(JSON.stringify(scheduleWrites)).not.toContain("PRIVATE");
  });

  it("clears private schedules on signout while closed and before guest rendering", async () => {
    storedLogin("schedule-logout-A");
    const view = render(<App showPlan={false} />);
    act(() => seedSchedule("schedule-logout-A"));
    act(() => auth.signOut());
    expect(scheduleStore.useSchedule.getState()).toMatchObject({ ownerId: null, entries: [], selectedComponents: [] });
    act(() => auth.continueAsGuest());
    view.rerender(<App showPlan={false} showSchedule />);
    expect(JSON.stringify(scheduleRenders)).not.toContain("PRIVATE");
    expect(scheduleReads).toHaveLength(0);
    expect(scheduleWrites).toHaveLength(0);
  });

  it("clears schedule ownership in memory when storage writes fail", async () => {
    storedLogin("schedule-memory-A");
    render(<App showPlan={false} />);
    act(() => seedSchedule("schedule-memory-A"));
    const unavailable = () => {
      throw new Error("Storage unavailable");
    };
    vi.stubGlobal("localStorage", { getItem: unavailable, setItem: unavailable, removeItem: unavailable });
    await login("schedule-memory-B");
    expect(scheduleStore.useSchedule.getState()).toMatchObject({
      ownerId: "schedule-memory-B",
      entries: [],
      dirty: false,
    });
    act(() => seedSchedule("schedule-memory-B"));
    act(() => auth.continueAsGuest());
    expect(scheduleStore.useSchedule.getState()).toMatchObject({ ownerId: null, entries: [], dirty: false });
  });

  it("rehydrates the same account after logout and preserves ordinary pane remounts", async () => {
    const remote = { entries: [{ code: "CPSC 110", section: "101", term: "term-1" }], activeTerm: "term-1" };
    getSchedule = async () => Response.json({ schedule: remote });
    storedLogin("schedule-return-A");
    const view = render(<App showPlan={false} showSchedule />);
    await act(async () => {});
    expect(scheduleStore.useSchedule.getState().entries[0]?.snapshot.title).toBe("Server course");
    view.rerender(<App showPlan={false} />);
    view.rerender(<App showPlan={false} showSchedule />);
    await act(async () => {});
    expect(scheduleReads).toHaveLength(1);
    act(() => auth.signOut());
    await login("schedule-return-A");
    expect(scheduleReads).toHaveLength(2);
    expect(scheduleStore.useSchedule.getState().entries[0]?.snapshot.title).toBe("Server course");
  });
});

describe("planner account privacy with real auth and storage", () => {
  it("never renders or adopts A's plan for B while B's empty server response is pending", async () => {
    seedPlan("owner-A");
    storedLogin("owner-B");
    const response = deferred<Response>();
    getPlan = () => response.promise;
    render(<App />);
    expect(renders.filter((entry) => entry.userId === "owner-B").length).toBeGreaterThan(0);
    expect(
      renders.filter((entry) => entry.userId === "owner-B").every((entry) => !entry.plan.includes("PRIVATE")),
    ).toBe(true);
    expect(store.usePlanner.getState()).toMatchObject({ ownerId: "owner-B", past: [], future: [], flashBlockId: null });
    await act(async () => response.resolve(Response.json({ plan: null })));
    expect(JSON.stringify(writes)).not.toContain("PRIVATE");
    expect(store.usePlanner.getState().faculty).toBeNull();
    expect(store.usePlanner.getState().lookupQuery).toBe("");
  });

  it("clears owned data and history on signout even while the planner is closed", async () => {
    storedLogin("signout-A");
    const view = render(<App />);
    await act(async () => {});
    act(() => seedPlan("signout-A"));
    view.rerender(<App showPlan={false} />);
    act(() => auth.signOut());
    expect(store.usePlanner.getState()).toMatchObject({ ownerId: null, past: [], future: [], flashBlockId: null });
    expect(JSON.stringify(store.persistedSlice(store.usePlanner.getState()))).not.toContain("PRIVATE");
    act(() => auth.continueAsGuest());
    view.rerender(<App />);
    expect(renders.filter((entry) => entry.userId === "guest").every((entry) => !entry.plan.includes("PRIVATE"))).toBe(
      true,
    );
  });

  it("adopts explicitly guest data, omits ownership from uploads, and retains same-user edits on pane remount", async () => {
    render(<App />).unmount();
    seedPlan(null, "GUEST 101");
    storedLogin("guest-adopter");
    const view = render(<App />);
    await act(async () => {});
    expect(writes).toHaveLength(1);
    expect(JSON.stringify(writes[0].plan)).toContain("GUEST 101");
    expect(writes[0].plan).not.toHaveProperty("ownerId");
    expect(JSON.parse(localStorage.getItem("reodite-planner")!).state.ownerId).toBe("guest-adopter");
    act(() => store.usePlanner.getState().setLookupQuery("same-user edit"));
    view.rerender(<App showPlan={false} />);
    await act(async () => {});
    view.rerender(<App />);
    await act(async () => {});
    expect(reads).toHaveLength(1);
    expect(store.usePlanner.getState().lookupQuery).toBe("same-user edit");
    expect(JSON.stringify(writes.at(-1)?.plan)).toContain("same-user edit");
  });

  it.each([2, 3])("backs up an untagged cache at version %s without rendering or adopting it", async (version) => {
    seedPlan(null, "LEGACY 101");
    const legacy = store.persistedSlice(store.usePlanner.getState());
    const raw = JSON.stringify({ version, state: legacy }, null, 2);
    localStorage.setItem("reodite-planner", raw);
    await store.usePlanner.persist.rehydrate();
    expect(localStorage.getItem("reodite-planner.unowned-backup")).toBe(raw);
    storedLogin("legacy-B");
    render(<App />);
    await act(async () => {});
    expect(JSON.stringify(renders)).not.toContain("LEGACY 101");
    expect(JSON.stringify(writes)).not.toContain("LEGACY 101");
    await store.usePlanner.persist.rehydrate();
    expect(JSON.stringify(store.usePlanner.getState())).not.toContain("LEGACY 101");
    expect(localStorage.getItem("reodite-planner.unowned-backup")).toBe(raw);
  });

  it("preserves the original legacy value when backup fails, including later edits and clearStorage", async () => {
    const raw = JSON.stringify({ version: 2, state: { lookupQuery: "unowned private lookup" } });
    localStorage.setItem("reodite-planner", raw);
    const setItem = browserStorage.setItem.bind(browserStorage);
    vi.stubGlobal("localStorage", {
      getItem: browserStorage.getItem.bind(browserStorage),
      removeItem: browserStorage.removeItem.bind(browserStorage),
      setItem: (key: string, value: string) => {
        if (key === "reodite-planner.unowned-backup") throw new Error("Quota exceeded");
        setItem(key, value);
      },
    });
    await store.usePlanner.persist.rehydrate();
    storedLogin("backup-B");
    render(<App />);
    await act(async () => {});
    act(() => store.usePlanner.getState().setLookupQuery("new safe edit"));
    store.usePlanner.persist.clearStorage();
    expect(localStorage.getItem("reodite-planner")).toBe(raw);
    expect(JSON.stringify(renders)).not.toContain("unowned private lookup");
    expect(JSON.stringify(writes)).not.toContain("unowned private lookup");
    vi.stubGlobal("localStorage", browserStorage);
    act(() => store.usePlanner.getState().setLookupQuery("safe retry"));
    expect(localStorage.getItem("reodite-planner.unowned-backup")).toBe(raw);
    expect(JSON.parse(localStorage.getItem("reodite-planner")!).state.lookupQuery).toBe("safe retry");
  });

  it("does not overwrite a different existing legacy backup", async () => {
    localStorage.setItem("reodite-planner.unowned-backup", "first private backup");
    const raw = JSON.stringify({ version: 2, state: { lookupQuery: "second private cache" } });
    localStorage.setItem("reodite-planner", raw);
    await store.usePlanner.persist.rehydrate();
    act(() => store.claimPlannerOwner("backup-conflict-B"));
    expect(localStorage.getItem("reodite-planner")).toBe(raw);
    expect(localStorage.getItem("reodite-planner.unowned-backup")).toBe("first private backup");
    expect(store.usePlanner.getState().lookupQuery).toBe("");
  });

  it("drops A's pending debounce across direct account changes and revokes old token/API closures", async () => {
    vi.useFakeTimers();
    storedLogin("pending-A");
    render(<App />);
    await act(async () => {});
    const oldApi = api;
    const oldToken = auth.getToken;
    act(() => seedPlan("pending-A"));
    await login("pending-B");
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(
      writes
        .filter((write) => write.token === `Bearer ${token("pending-B")}`)
        .every((write) => !JSON.stringify(write.plan).includes("PRIVATE")),
    ).toBe(true);
    expect(await oldToken()).toBeNull();
    await expect(oldApi.savePlan({ private: "old callback" })).rejects.toMatchObject({ status: 401 });
    expect(auth.user?.userId).toBe("pending-B");
  });

  it("observes cross-tab signout/login and denies old work before a storage event arrives", async () => {
    storedLogin("tab-A");
    render(<App />);
    await act(async () => {});
    act(() => seedPlan("tab-A"));
    const oldApi = api;
    const oldToken = auth.getToken;
    storedLogin("tab-B");
    await act(async () => {
      expect(await oldToken()).toBeNull();
    });
    act(() => storageEvent());
    await act(async () => {});
    expect(auth.user?.userId).toBe("tab-B");
    expect(JSON.stringify(renders.filter((entry) => entry.userId === "tab-B"))).not.toContain("PRIVATE");
    await expect(oldApi.savePlan({ private: "tab-A" })).rejects.toMatchObject({ status: 401 });
    act(() => {
      localStorage.removeItem("reodite.auth.token");
      localStorage.removeItem("reodite.auth.user");
      storageEvent(null);
    });
    expect(auth.status).toBe("signedOut");
    expect(store.usePlanner.getState().ownerId).toBeNull();
  });

  it("ignores A's delayed hydration after switching to B", async () => {
    storedLogin("hydrate-A");
    const response = deferred<Response>();
    getPlan = async (authorization) =>
      authorization === `Bearer ${token("hydrate-A")}` ? response.promise : Response.json({ plan: null });
    render(<App />);
    await act(async () => {});
    await login("hydrate-B");
    await act(async () => response.resolve(Response.json({ plan: { years: [], lookupQuery: "private A response" } })));
    expect(auth.user?.userId).toBe("hydrate-B");
    expect(JSON.stringify(renders.filter((entry) => entry.userId === "hydrate-B"))).not.toContain("private A response");
    expect(JSON.stringify(writes)).not.toContain("private A response");
  });

  it("hydrates same-user server data and debounces only persisted edits", async () => {
    vi.useFakeTimers();
    seedPlan("normal-A", "LOCAL 101");
    const remote = { years: [{ id: "remote", terms: [{ season: "fall", blocks: [{ code: "SERVER 101" }] }] }] };
    getPlan = async () => Response.json({ plan: remote });
    storedLogin("normal-A");
    render(<App />);
    await act(async () => {});
    expect(JSON.stringify(store.usePlanner.getState().years)).toContain("SERVER 101");
    expect(store.usePlanner.getState()).toMatchObject({ past: [], future: [], ownerId: "normal-A" });
    expect(writes).toHaveLength(0);
    act(() => store.usePlanner.getState().setFlashBlockId("flash"));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(writes).toHaveLength(0);
    act(() => store.usePlanner.getState().setLookupQuery("normal edit"));
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(writes).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ token: `Bearer ${token("normal-A")}`, plan: { lookupQuery: "normal edit" } });
    expect(writes[0].plan).not.toHaveProperty("ownerId");
  });

  it("keeps the same session and pending edits across duplicate cross-tab storage notifications", async () => {
    vi.useFakeTimers();
    storedLogin("same-tab-A");
    getPlan = async () => Response.json({ plan: { years: [], lookupQuery: "server copy" } });
    render(<App />);
    await act(async () => {});
    const currentApi = api;
    const currentGetter = auth.getToken;
    act(() => store.usePlanner.getState().setLookupQuery("unsaved local edit"));
    act(() => storageEvent("reodite.auth.token"));
    act(() => storageEvent("reodite.auth.user"));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(api).toBe(currentApi);
    expect(auth.getToken).toBe(currentGetter);
    expect(reads).toHaveLength(1);
    expect(store.usePlanner.getState().lookupQuery).toBe("unsaved local edit");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      token: `Bearer ${token("same-tab-A")}`,
      plan: { lookupQuery: "unsaved local edit" },
    });
  });

  it("revokes pending saves and token getters on provider unmount", async () => {
    storedLogin("unmount-A");
    const view = render(<App />);
    await act(async () => {});
    const oldToken = auth.getToken;
    const oldApi = api;
    const count = writes.length;
    act(() => seedPlan("unmount-A"));
    view.unmount();
    await act(async () => {});
    expect(writes).toHaveLength(count);
    expect(await oldToken()).toBeNull();
    storedLogin("unmount-B");
    render(<App />);
    await act(async () => {});
    const before = writes.length;
    await expect(oldApi.savePlan({ lookupQuery: "private unmount A" })).rejects.toMatchObject({ status: 401 });
    expect(writes).toHaveLength(before);
    expect(auth.user?.userId).toBe("unmount-B");
  });

  it("keeps in-memory credentials identity-bound when browser storage is unavailable", async () => {
    render(<App />);
    const unavailable = () => {
      throw new Error("Storage unavailable");
    };
    vi.stubGlobal("localStorage", { getItem: unavailable, setItem: unavailable, removeItem: unavailable });
    await login("memory-A");
    const oldToken = auth.getToken;
    expect(await oldToken()).toBe(token("memory-A"));
    await login("memory-B");
    expect(await oldToken()).toBeNull();
    expect(await auth.getToken()).toBe(token("memory-B"));
    act(() => auth.continueAsGuest());
    expect(await auth.getToken()).toBe("guest");
    expect(store.usePlanner.getState().ownerId).toBeNull();
  });
});
