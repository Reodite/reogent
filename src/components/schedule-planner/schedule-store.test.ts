// @vitest-environment happy-dom

import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

let store: typeof import("./schedule-store");

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
});

beforeEach(() => {
  store.useSchedule.setState({ entries: [], activeTerm: "", stale: false });
});

describe("schedule store", () => {
  it("normalizes Vancouver course codes for storage and sharing", () => {
    expect(store.normalizeScheduleCode(" cpsc_v   221 ")).toBe("CPSC 221");
    expect(store.entryLabel({ code: "CPSC_V 221", section: "101" })).toBe("CPSC 221 101");
  });

  it("keeps one section per component and term", () => {
    store.useSchedule.getState().addEntry(doc, section("101", "09:00"));
    store.useSchedule.getState().addEntry(doc, section("102", "11:00"));
    store.useSchedule.getState().addEntry(doc, section("L1A", "13:00"));

    expect(store.useSchedule.getState().entries.map((entry) => entry.section)).toEqual(["102", "L1A"]);
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

  it("removes one component or all course components", () => {
    store.useSchedule.getState().addEntry(doc, section("101", "09:00"));
    store.useSchedule.getState().addEntry(doc, section("L1A", "13:00"));
    store.useSchedule.getState().removeEntry("CPSC 110", "101", term);
    expect(store.useSchedule.getState().entries.map((entry) => entry.section)).toEqual(["L1A"]);
    store.useSchedule.getState().removeCourse("CPSC_V 110", term);
    expect(store.useSchedule.getState().entries).toEqual([]);
  });
});
