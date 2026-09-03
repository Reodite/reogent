// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getProfile: vi.fn(), saveProfile: vi.fn() }));
const auth = vi.hoisted(() => ({
  status: "signedIn",
  isGuest: false,
  user: { username: "Ada", userId: "user-1" },
  signOut: vi.fn(),
}));

vi.mock("@/src/components/providers", () => ({ useApi: () => api }));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => auth }));
vi.mock("@/src/components/theme-toggle", () => ({ ThemeToggle: () => <div data-testid="theme-toggle" /> }));

const { default: SettingsPage, ProfileForm } = await import("./page");

beforeEach(() => {
  api.getProfile.mockReset();
  api.saveProfile.mockReset();
  auth.signOut.mockReset();
  auth.isGuest = false;
});

afterEach(cleanup);

describe("Settings", () => {
  it("reserves the profile form footprint while loading", () => {
    api.getProfile.mockReturnValue(new Promise(() => {}));
    render(<ProfileForm />);

    const loading = screen.getByRole("status", { name: "Loading student profile" });
    expect(loading).not.toBeNull();
    expect(document.querySelectorAll(".shell-skeleton").length).toBeGreaterThan(0);
    const action = loading.querySelector("[data-profile-loading-action]");
    expect(action?.className).toContain("h-11");
    expect(action?.className).toContain("sm:h-10");
  });

  it("uses the shared split workspace for account, appearance, and student profile", async () => {
    api.getProfile.mockResolvedValue({ profile: {} });
    const { container } = render(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Account" })).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Appearance" })).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Student profile" })).not.toBeNull();
    expect(container.querySelectorAll("main")).toHaveLength(0);
    const mainRegion = container.querySelector("[data-workspace-region='main']");
    expect(mainRegion?.querySelectorAll("[data-workspace-panel]")).toHaveLength(0);
    expect(mainRegion?.querySelector("[data-settings-profile]")).not.toBeNull();
    await screen.findByLabelText("Program");
  });

  it("withholds editable fields after load failure and unlocks them only after Retry", async () => {
    api.getProfile.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      profile: { program: "Computer Science", year: 3, student_type: "domestic" },
    });
    render(<ProfileForm />);

    expect(await screen.findByText("Profile unavailable")).not.toBeNull();
    expect(screen.queryByLabelText("Program")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    const program = await screen.findByLabelText("Program");
    expect((program as HTMLInputElement).value).toBe("Computer Science");
    expect(screen.getByRole("button", { name: "Save profile" })).not.toBeNull();
  });

  it("disables the entire fieldset while saving without clearing values", async () => {
    let finish: (() => void) | undefined;
    api.getProfile.mockResolvedValue({ profile: { program: "Mathematics" } });
    api.saveProfile.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<ProfileForm />);
    const program = await screen.findByLabelText("Program");
    fireEvent.change(program, { target: { value: "Statistics" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    const fieldset = program.closest("fieldset");
    await waitFor(() => expect(fieldset?.disabled).toBe(true));
    expect((program as HTMLInputElement).value).toBe("Statistics");
    finish?.();
    await waitFor(() => expect(screen.getByText("Saved")).not.toBeNull());
  });
});
