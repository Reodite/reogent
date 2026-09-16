// @vitest-environment happy-dom
import type { CourseDoc } from "@/src/lib/api-types";
import type { Schedule } from "@/src/lib/schedule/types";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { SchedulePlannerPane } from "./schedule-planner-pane";
import { useSchedule } from "./schedule-store";

vi.hoisted(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
});
afterAll(() => vi.unstubAllGlobals());

const term = "2026-27 Winter Term 1";
const doc: CourseDoc = {
  code: "CPSC 110",
  subject: "CPSC",
  number: "110",
  title: "Computation",
  description: "",
  credits: 4,
  prerequisite: null,
  corequisite: null,
  terms: [term],
  sections: [
    { section: "101", term, days: ["Mon"], start_time: "09:00", end_time: "10:00" },
    { section: "L1A", term, days: ["Tue"], start_time: "11:00", end_time: "12:00" },
    { section: "L1B", term, days: ["Tue"], start_time: "11:00", end_time: "12:00" },
  ],
};
const schedule: Schedule = {
  importedAt: "2026-09-01T00:00:00Z",
  sourceFileName: "Workday.xlsx",
  sections: [
    {
      id: "lecture",
      courseCode: "CPSC 110",
      title: "Computation lecture",
      component: "Lecture",
      instructors: [],
      termStart: "2026-09-01",
      meetings: [{ days: ["Mon"], startMin: 540, endMin: 600, raw: "" }],
    },
    {
      id: "lab",
      courseCode: "CPSC 110",
      title: "Computation lab",
      component: "Laboratory",
      instructors: [],
      termStart: "2026-09-01",
      meetings: [{ days: ["Tue"], startMin: 660, endMin: 720, raw: "" }],
    },
    {
      id: "tba",
      courseCode: "CPSC 110",
      title: "Unscheduled tutorial",
      component: "Tutorial",
      instructors: [],
      termStart: "2026-09-01",
      meetings: [],
    },
  ],
};
const api = { getCourse: vi.fn(async () => doc) };
vi.mock("@/src/components/providers", () => ({ useApi: () => api }));
vi.mock("./use-schedule-sync", () => ({ useScheduleSync: () => false }));
vi.mock("@/src/components/schedule/upload-dropzone", () => ({
  UploadDropzone: ({ onParsed }: { onParsed: (schedule: Schedule) => void }) => (
    <button type="button" onClick={() => onParsed(schedule)}>
      Import fixture
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  useSchedule.setState({ entries: [], activeTerm: "", stale: false });
  vi.clearAllMocks();
});

describe("Planner import review", () => {
  it.each(["Merge with planner", "Replace planner"])(
    "requires an ambiguous choice before %s and preserves skipped rows",
    async (action) => {
      render(<SchedulePlannerPane />);
      fireEvent.click(screen.getByRole("button", { name: "Import fixture" }));
      const dialog = await screen.findByRole("dialog", { name: "Review Workday import" });
      const review = within(dialog);
      expect(review.getByRole("heading", { level: 2 }).id).toBe("schedule-import-title");
      expect(dialog.className).toContain("p-0");
      expect(dialog.querySelector("header")?.className).toContain("p-4 sm:p-6");
      expect(dialog.querySelector("footer")?.className).toContain("p-4 sm:p-6");
      expect(dialog.querySelector("[data-dialog-actions]")?.className).toContain("flex-col-reverse");
      expect(dialog.querySelector("[data-dialog-actions]")?.className).not.toContain("mt-6");
      expect(review.getByText("Matched").className).toContain("bg-surface-container");
      expect(review.getByText("Choose section").className).toContain("bg-tertiary-container");
      expect(review.getByText("Skipped").className).toContain("bg-error-container");
      expect(review.getByText("Workday lists no meeting time.")).toBeTruthy();
      await waitFor(() =>
        expect(document.activeElement).toBe(review.getByRole("button", { name: "Close Workday import review" })),
      );
      const apply = review.getByRole<HTMLButtonElement>("button", { name: action });
      expect(apply.disabled).toBe(true);
      expect(useSchedule.getState().entries).toHaveLength(0);
      fireEvent.change(review.getByLabelText("Catalog section"), { target: { value: "L1B" } });
      expect(apply.disabled).toBe(false);
      expect(review.getByText("Workday.xlsx matched 2 of 3 sections.")).toBeTruthy();
      fireEvent.click(apply);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(
        useSchedule
          .getState()
          .entries.map((entry) => entry.section)
          .sort(),
      ).toEqual(["101", "L1B"]);
    },
  );
});
