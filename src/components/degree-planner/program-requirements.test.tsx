// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getRequirementsFor, getDegreeRules } = vi.hoisted(() => ({
  getRequirementsFor: vi.fn(),
  getDegreeRules: vi.fn(),
}));
const values = new Map<string, string>();
const storage: Storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => void values.set(key, String(value)),
  removeItem: (key) => void values.delete(key),
  clear: () => values.clear(),
  key: (index) => Array.from(values.keys())[index] ?? null,
  get length() {
    return values.size;
  },
};

vi.mock("@/src/lib/program-requirements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/program-requirements")>();
  const major = {
    id: "cpsc-major",
    url: "https://calendar.ubc.ca/program",
    title: "Computer Science",
    label: "Computer Science",
    faculty: "Science",
    degree: "BSc",
    kind: "major",
    source_urls: [],
  };
  const minor = {
    ...major,
    id: "math-minor",
    url: "https://calendar.ubc.ca/minor",
    title: "Mathematics Minor",
    label: "Mathematics Minor",
    kind: "minor",
  };
  return {
    ...actual,
    getRequirementsFor,
    getDegreeRules,
    getSubjectFaculties: async () => ({ ENGL: "Faculty of Arts" }),
    getProgramIndex: async () => ({
      faculties: ["Science"],
      majorsByFaculty: new Map([["Science", [major]]]),
      minorsByFaculty: new Map([["Science", [minor]]]),
      byId: new Map([
        [major.id, major],
        [minor.id, minor],
      ]),
      byUrl: new Map(),
    }),
  };
});

Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

const { ProgramSelectors, ProgramSelectorsLoading, ProgramProgress } = await import("./program-requirements");
const { usePlanner } = await import("./planner-store");

beforeEach(() => {
  usePlanner.setState({ faculty: null, major: null, minor: null });
  getDegreeRules.mockResolvedValue(new Map());
});

afterEach(() => {
  cleanup();
  values.clear();
  getRequirementsFor.mockReset();
  getDegreeRules.mockReset();
});

describe("ProgramSelectors", () => {
  it("announces loading before enabling program controls", () => {
    render(<ProgramSelectorsLoading />);
    expect(screen.getByRole("status", { name: "Loading programs…" })).not.toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("commits an exact faculty choice and preserves its program when refocused", async () => {
    usePlanner.setState({ faculty: null, major: null, minor: null });
    render(<ProgramSelectors />);
    const faculty = await screen.findByRole("combobox", { name: "Faculty" });
    fireEvent.change(faculty, { target: { value: "Science" } });
    expect(usePlanner.getState().faculty).toBe("Science");

    const major = screen.getByRole("combobox", { name: "Major / program" }) as HTMLInputElement;
    expect(major.disabled).toBe(false);
    fireEvent.change(major, { target: { value: "Computer Science" } });
    expect(usePlanner.getState().major).toBe("cpsc-major");

    fireEvent.focus(faculty);
    fireEvent.blur(faculty);
    expect(usePlanner.getState().major).toBe("cpsc-major");
  });

  it("keeps external navigation separate from the major field label", async () => {
    usePlanner.setState({
      faculty: "Science",
      major: "https://calendar.ubc.ca/program",
      minor: null,
    });
    render(<ProgramSelectors />);

    const link = await screen.findByRole("link", { name: /UBC Calendar/ });
    const input = screen.getByRole("combobox", { name: "Major / program" });
    await waitFor(() => expect((input as HTMLInputElement).value).toBe("Computer Science"));
    expect(link.closest("label")).toBeNull();
    expect(link.getAttribute("href")).toBe("https://calendar.ubc.ca/program");
    expect(usePlanner.getState().major).toBe("cpsc-major");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("ProgramProgress", () => {
  it("migrates both stored program URLs to registry identities", async () => {
    usePlanner.setState({
      faculty: "Science",
      major: "https://calendar.ubc.ca/program",
      minor: "https://calendar.ubc.ca/minor",
    });
    render(<ProgramSelectors />);
    await waitFor(() => {
      expect(usePlanner.getState().major).toBe("cpsc-major");
      expect(usePlanner.getState().minor).toBe("math-minor");
    });
  });

  it("shows faculty credit rules even without major requirements", async () => {
    usePlanner.setState({ major: "cpsc-major" });
    getRequirementsFor.mockResolvedValue(null);
    getDegreeRules.mockResolvedValue(
      new Map([
        [
          "BSc",
          {
            categories: [
              {
                name: "Arts credits",
                credits_required: 12,
                options: [{ rule: { kind: "faculty_credit", faculty: "Faculty of Arts" } }],
              },
            ],
          },
        ],
      ]),
    );
    render(
      <ProgramProgress
        courseIndex={
          new Map([
            ["ENGL 110", { code: "ENGL 110", title: "Literature", credits: 3, prerequisite: "", corequisite: "" }],
          ])
        }
        plannedCodes={new Set(["ENGL 110"])}
      />,
    );
    expect(await screen.findByRole("heading", { name: "BSc degree-wide requirements" })).not.toBeNull();
    expect(screen.getByText("3/12 cr")).not.toBeNull();
    expect(screen.queryByText(/No requirements are available/)).toBeNull();
  });

  it("shows a minor alone and removes its stale requirements when the minor changes", async () => {
    usePlanner.setState({ minor: "math-minor" });
    getRequirementsFor.mockResolvedValueOnce({
      kind: "prose",
      program_url: "minor",
      text: "",
      referenced_courses: ["MATH 100"],
    });
    render(<ProgramProgress courseIndex={new Map()} plannedCodes={new Set()} />);
    expect(await screen.findByText("MATH 100")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Mathematics Minor" })).not.toBeNull();
    getRequirementsFor.mockReturnValue(new Promise(() => {}));
    act(() => usePlanner.setState({ minor: "second-minor" }));
    expect(screen.getByRole("status", { name: "Loading requirements…" })).not.toBeNull();
    expect(screen.queryByText("MATH 100")).toBeNull();
  });

  it("removes the previous program while the next requirements load", async () => {
    getRequirementsFor.mockResolvedValueOnce({
      kind: "prose",
      program_url: "first",
      text: "",
      referenced_courses: ["CPSC 110"],
    });
    usePlanner.setState({ major: "first" });
    render(<ProgramProgress courseIndex={new Map()} plannedCodes={new Set()} />);
    expect(await screen.findByText("CPSC 110")).not.toBeNull();
    getRequirementsFor.mockReturnValue(new Promise(() => {}));
    act(() => usePlanner.setState({ major: "second" }));
    expect(screen.getByRole("status", { name: "Loading requirements…" })).not.toBeNull();
    expect(screen.queryByText("CPSC 110")).toBeNull();
  });

  it.each(["missing", "failed"])("settles %s requirements with feedback", async (outcome) => {
    usePlanner.setState({ major: "unknown" });
    if (outcome === "missing") getRequirementsFor.mockResolvedValue(null);
    else getRequirementsFor.mockRejectedValue(new Error("offline"));
    render(<ProgramProgress courseIndex={new Map()} plannedCodes={new Set()} />);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(
      outcome === "failed" ? screen.getByRole("alert") : screen.getByText(/No requirements are available/),
    ).not.toBeNull();
  });
});
