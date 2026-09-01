// @vitest-environment happy-dom
import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  user: { userId: "sync-test-user", username: "student" },
  isGuest: false,
}));
const apiMock = vi.hoisted(() => ({
  getSchedule: vi.fn(),
  saveSchedule: vi.fn(),
  getCourse: vi.fn(),
}));

vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => authMock }));
vi.mock("@/src/components/providers", () => ({ useApi: () => apiMock }));

let store: typeof import("./schedule-store");
let useScheduleSync: typeof import("./use-schedule-sync").useScheduleSync;

const term = "2026-27 Winter Term 1";
const doc: CourseDoc = {
  code: "CPSC 110",
  subject: "CPSC",
  number: "110",
  title: "Computation, Programs, and Programming",
  description: "",
  credits: 4,
  prerequisite: null,
  corequisite: null,
  terms: [term],
  sections: [],
};
const section: CourseSection = {
  section: "A_301",
  term,
  days: ["m", "w", "f"],
  start_time: "09:00",
  end_time: "10:00",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function Harness() {
  useScheduleSync();
  return null;
}

beforeAll(async () => {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  store = await import("./schedule-store");
  ({ useScheduleSync } = await import("./use-schedule-sync"));
});

beforeEach(() => {
  apiMock.getSchedule.mockReset();
  apiMock.saveSchedule.mockReset().mockResolvedValue(undefined);
  apiMock.getCourse.mockReset();
  store.useSchedule.setState({
    ownerId: null,
    dirty: false,
    revision: 0,
    selectedComponents: [],
    removedComponents: [],
    removedCourses: [],
    activeTermDirty: false,
    replacePending: false,
    entries: [],
    activeTerm: "",
    stale: false,
  });
});

afterEach(() => {
  cleanup();
});

describe("useScheduleSync", () => {
  it("does not upload an unmerged edit when the pane closes during hydration", async () => {
    const get = deferred<{ schedule: unknown }>();
    apiMock.getSchedule.mockReturnValue(get.promise);
    const view = render(<Harness />);

    act(() => {
      store.useSchedule.getState().addEntry(doc, section);
    });
    view.unmount();

    expect(apiMock.saveSchedule).not.toHaveBeenCalled();
    expect(store.useSchedule.getState()).toMatchObject({ dirty: true, ownerId: "sync-test-user" });
    expect(store.useSchedule.getState().selectedComponents).toContain(store.componentKey("CPSC 110", term, "A_301"));

    get.resolve({ schedule: { entries: [], activeTerm: "" } });
    await Promise.resolve();
    expect(apiMock.saveSchedule).not.toHaveBeenCalled();
  });

  it("keeps a full replacement authoritative while server hydration finishes", async () => {
    const get = deferred<{ schedule: unknown }>();
    const replacement = { ...section, section: "A_302", start_time: "11:00", end_time: "12:00" };
    const liveDoc = { ...doc, sections: [section, replacement] };
    apiMock.getSchedule.mockReturnValue(get.promise);
    apiMock.getCourse.mockResolvedValue(liveDoc);
    render(<Harness />);

    act(() => {
      store.useSchedule.getState().importSections([{ doc: liveDoc, section: replacement }], "replace");
    });
    await act(async () => {
      get.resolve({ schedule: { entries: [{ code: "CPSC 110", section: "A_301", term }], activeTerm: term } });
    });

    await waitFor(() => {
      expect(store.useSchedule.getState().entries.map((entry) => entry.section)).toEqual(["A_302"]);
    });
    expect(store.useSchedule.getState().replacePending).toBe(true);
  });
});
