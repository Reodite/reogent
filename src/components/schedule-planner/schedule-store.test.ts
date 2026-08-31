// @vitest-environment happy-dom

import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

let store: typeof import("./schedule-store");
let sync: typeof import("./use-schedule-sync");

const term = "2026-27 Winter Term 1";
const doc: CourseDoc = {
  code: "CPSC_V 110",
  subject: "CPSC_V",
  number: "110",
  title: "Computation, Programs, and Programming",
  description: "",
  credits: 4,
  prerequisite: null,
  corequisite: null,
  terms: [term],
  sections: [],
};

function section(sectionCode: string, start: string): CourseSection {
  return {
    section: sectionCode,
    term,
    days: ["Mon", "Wed", "Fri"],
    start_time: start,
    end_time: "10:00",
  };
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
  sync = await import("./use-schedule-sync");
});

beforeEach(() => {
  store.useSchedule.setState({
    ownerId: null,
    dirty: false,
    revision: 0,
    selectedComponents: [],
    removedComponents: [],
    removedCourses: [],
    activeTermDirty: false,
    entries: [],
    activeTerm: "",
    stale: false,
  });
});

describe("schedule store", () => {
  it("normalizes Vancouver course codes for storage and sharing", () => {
    expect(store.normalizeScheduleCode(" cpsc_v   221 ")).toBe("CPSC 221");
    expect(store.entryLabel({ code: "CPSC_V 221", section: "101" })).toBe("CPSC 221 101");
  });

  it("keeps one section per component and term, including prefixed dataset codes", () => {
    store.useSchedule.getState().addEntry(doc, section("A_301", "09:00"));
    store.useSchedule.getState().addEntry(doc, section("A_302", "11:00"));
    store.useSchedule.getState().addEntry(doc, { ...section("A_L05", "13:00"), days: ["t", "th"] });

    expect(store.useSchedule.getState().entries.map((entry) => entry.section)).toEqual(["A_302", "A_L05"]);
    expect(store.useSchedule.getState().entries[1].snapshot.days).toEqual(["Tue", "Thu"]);
    expect(store.useSchedule.getState().activeTerm).toBe(term);
  });

  it("syncs identifiers while retaining snapshots locally", () => {
    store.useSchedule.getState().addEntry(doc, section("101", "09:00"));
    expect(store.syncedSlice(store.useSchedule.getState())).toEqual({
      entries: [{ code: "CPSC 110", section: "101", term }],
      activeTerm: term,
    });
    expect(store.useSchedule.getState().entries[0].snapshot.title).toBe(doc.title);
  });

  it("merges edits made while server hydration is in flight", () => {
    const remoteLecture = {
      code: "CPSC 110",
      section: "A_301",
      term,
      snapshot: {
        title: doc.title,
        instructor: null,
        days: ["Mon"],
        start_time: "09:00",
        end_time: "10:00",
        status: null,
      },
    };
    const remoteMath = { ...remoteLecture, code: "MATH 100", section: "A_201" };
    const replacement = { ...remoteLecture, section: "A_302" };
    const lab = { ...remoteLecture, section: "A_L05" };

    const merged = sync.mergeHydratedEntries(
      [remoteLecture, remoteMath],
      [replacement, lab],
      [store.componentKey("CPSC 110", term, "A_302"), store.componentKey("CPSC 110", term, "A_L05")],
      [],
      [],
    );
    expect(merged.map((entry) => `${entry.code} ${entry.section}`).sort()).toEqual([
      "CPSC 110 A_302",
      "CPSC 110 A_L05",
      "MATH 100 A_201",
    ]);
  });

  it("applies component removal intent to a different server section id", () => {
    const remoteLecture = {
      code: "CPSC 110",
      section: "A_302",
      term,
      snapshot: {
        title: doc.title,
        instructor: null,
        days: ["Mon"],
        start_time: "11:00",
        end_time: "12:00",
        status: null,
      },
    };
    expect(
      sync.mergeHydratedEntries([remoteLecture], [], [], [store.componentKey("CPSC 110", term, "A_301")], []),
    ).toEqual([]);
  });

  it("clears ownerless version-1 snapshots during migration", () => {
    const migrated = store.migrateScheduleState(
      { entries: [{ code: "CPSC 110", section: "101", term }], activeTerm: term },
      1,
    );
    expect(migrated).toMatchObject({ ownerId: null, entries: [], activeTerm: "", dirty: false });
  });

  it("does not expose or adopt another account's local cache", () => {
    store.useSchedule.getState().addEntry(doc, section("101", "09:00"));
    store.claimScheduleOwner("user-a");
    expect(store.useSchedule.getState().entries).toHaveLength(1);

    store.claimScheduleOwner("user-b");
    expect(store.useSchedule.getState()).toMatchObject({ ownerId: "user-b", entries: [], activeTerm: "" });

    store.clearOwnedScheduleForGuest();
    expect(store.useSchedule.getState()).toMatchObject({ ownerId: null, entries: [] });
  });

  it("removes one component or all course components", () => {
    store.useSchedule.getState().addEntry(doc, section("101", "09:00"));
    store.useSchedule.getState().addEntry(doc, section("L1A", "13:00"));
    store.useSchedule.getState().removeEntry("CPSC 110", "101", term);
    expect(store.useSchedule.getState().entries.map((entry) => entry.section)).toEqual(["L1A"]);
    expect(store.useSchedule.getState().removedComponents).toContain(store.componentKey("CPSC 110", term, "101"));
    store.useSchedule.getState().removeCourse("CPSC_V 110", term);
    expect(store.useSchedule.getState().entries).toEqual([]);
  });
});
