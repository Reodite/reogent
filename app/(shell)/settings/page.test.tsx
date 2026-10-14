// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getProfile: vi.fn(), saveProfile: vi.fn() }));
const auth = vi.hoisted(() => ({
  status: "signedIn",
  isGuest: false,
  user: { username: "Ada", userId: "user-1" },
  signOut: vi.fn(),
}));

vi.mock("@/src/components/providers", () => ({
  useApi: () => api,
  useProfile: () => ({ saveProfile: api.saveProfile }),
  useTheme: () => ({ mode: "light" }),
}));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => auth }));
vi.mock("@/src/components/theme-toggle", () => ({ ThemeToggle: () => <div data-testid="theme-toggle" /> }));

const { default: SettingsPage } = await import("./page");

beforeEach(() => {
  api.getProfile.mockReset();
  api.saveProfile.mockReset();
  auth.signOut.mockReset();
  auth.isGuest = false;
});

afterEach(cleanup);

describe("Settings", () => {
  it("keeps the page export contract", async () => {
    expect(Object.keys(await import("./page"))).toEqual(["default"]);
  });

  it("shows only appearance for guests without loading personalization", () => {
    auth.isGuest = true;
    const { container } = render(<SettingsPage />);

    expect(screen.getByRole("region", { name: "Appearance" })).not.toBeNull();
    expect(screen.getByTestId("theme-toggle")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Student profile" })).toBeNull();
    expect(container.querySelector("[data-settings-profile]")).toBeNull();
    expect(screen.queryByLabelText("What should we call you?")).toBeNull();
    expect(screen.queryByLabelText("What are you studying?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull();
    expect(screen.queryByRole("status", { name: "Loading student profile" })).toBeNull();
    expect(screen.queryByText(/student defaults/i)).toBeNull();
    expect(api.getProfile).not.toHaveBeenCalled();
    expect(api.saveProfile).not.toHaveBeenCalled();
  });

  it("keeps only appearance in a single card for signed-in users", () => {
    const { container } = render(<SettingsPage />);
    expect(container.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-composition")).toBe("single");
    expect(container.querySelectorAll("[data-workspace-canvas]")).toHaveLength(1);
    expect(container.querySelector("[data-workspace-region='rail']")).toBeNull();
    expect(container.querySelector("[data-workspace-view-toggle]")).toBeNull();
    expect(container.querySelector("[data-workspace-panel]")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "Account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(container.querySelectorAll("main")).toHaveLength(0);
    const canvas = container.querySelector("[data-workspace-canvas]");
    expect(canvas?.contains(screen.getByRole("region", { name: "Appearance" }))).toBe(true);
    expect(canvas?.contains(screen.getByTestId("theme-toggle"))).toBe(true);
    expect(screen.queryByRole("region", { name: "Student profile" })).toBeNull();
    expect(screen.queryByLabelText("What are you studying?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull();
    expect(screen.queryByRole("status", { name: "Loading student profile" })).toBeNull();
    expect(screen.queryByText(/student defaults/i)).toBeNull();
    expect(api.getProfile).not.toHaveBeenCalled();
    expect(api.saveProfile).not.toHaveBeenCalled();
  });
});
