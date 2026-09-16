// @vitest-environment happy-dom
import OnboardingPage from "@/app/onboarding/page";
import SettingsPage from "@/app/settings/page";
import { AppProviders } from "@/src/components/providers";
import type { StudentProfile } from "@/src/shared/profile";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/onboarding",
  search: "redirect=%2Ftools%2Fcalendar",
  auth: { status: "signedIn", isGuest: false, user: { userId: "u1", username: "sam" }, signOut: vi.fn() },
  router: { replace: vi.fn(), push: vi.fn() },
  api: { getProfile: vi.fn(), saveProfile: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => state.router,
}));
vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => state.auth,
  AppAuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/src/lib/api", () => ({ createChatApi: () => state.api }));
vi.mock("motion/react", () => ({
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
  useReducedMotion: () => true,
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  state.pathname = "/onboarding";
  state.search = "redirect=%2Ftools%2Fcalendar";
  state.auth = { status: "signedIn", isGuest: false, user: { userId: "u1", username: "sam" }, signOut: vi.fn() };
  state.api.getProfile.mockReset().mockResolvedValue({ profile: null });
  state.api.saveProfile.mockReset().mockResolvedValue(undefined);
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(cleanup);

async function start() {
  render(
    <AppProviders>
      <OnboardingPage />
    </AppProviders>,
  );
  await screen.findByRole("heading", { name: "Welcome to Reodite" });
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

describe("first-login onboarding", () => {
  it("keeps entries across Next and Back, and saves all cards before continuing", async () => {
    await start();
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Let's customize your experience")).toBeTruthy();
    next();
    fireEvent.change(screen.getByLabelText("What should we call you?"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText("Year of study"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("What are you studying?"), { target: { value: "Computer Science" } });
    next();
    fireEvent.click(screen.getByLabelText("Dark"));
    fireEvent.change(screen.getByRole("combobox", { name: /Tuition defaults/ }), {
      target: { value: "international" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByLabelText("What should we call you?") as HTMLInputElement).value).toBe("Sam");
    expect((screen.getByLabelText("Year of study") as HTMLSelectElement).value).toBe("3");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "A little about you" }));
    next();
    expect((screen.getByLabelText("Dark") as HTMLInputElement).checked).toBe(true);
    expect(state.api.saveProfile).not.toHaveBeenCalled();
    let resolveSave!: () => void;
    state.api.saveProfile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(state.router.replace).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    resolveSave();
    await waitFor(() => expect(state.router.replace).toHaveBeenCalledWith("/tools/calendar"));
    expect(state.api.saveProfile).toHaveBeenCalledWith({
      preferred_name: "Sam",
      year: 3,
      program: "Computer Science",
      theme: "dark",
      student_type: "international",
      onboarding_completed: true,
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("campus.theme")).toBe("dark");
  });

  it("retains entries after a failed save and allows retry", async () => {
    state.api.saveProfile.mockRejectedValueOnce(new Error("offline"));
    await start();
    next();
    fireEvent.change(screen.getByLabelText("What should we call you?"), { target: { value: "Sam" } });
    next();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    await screen.findByRole("alert");
    expect(state.router.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByLabelText("What should we call you?") as HTMLInputElement).value).toBe("Sam");
    next();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(state.router.replace).toHaveBeenCalledWith("/tools/calendar"));
  });

  it("skips setup while preserving an existing profile", async () => {
    state.api.getProfile.mockResolvedValue({ profile: { program: "Arts", year: 2 } });
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Skip setup" }));
    await waitFor(() =>
      expect(state.api.saveProfile).toHaveBeenCalledWith({
        program: "Arts",
        year: 2,
        theme: "system",
        onboarding_completed: true,
      }),
    );
  });

  it("redirects returning users without showing setup", async () => {
    state.api.getProfile.mockResolvedValue({ profile: { onboarding_completed: true, theme: "dark" } });
    render(
      <AppProviders>
        <OnboardingPage />
      </AppProviders>,
    );
    await waitFor(() => expect(state.router.replace).toHaveBeenCalledWith("/tools/calendar"));
    expect(screen.queryByText("Let's customize your experience")).toBeNull();
    expect(state.api.saveProfile).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("gates direct app visits until setup completes", async () => {
    state.pathname = "/tools/calendar";
    render(
      <AppProviders>
        <p>Private app</p>
      </AppProviders>,
    );
    await waitFor(() => expect(state.router.replace).toHaveBeenCalledWith("/onboarding?redirect=%2Ftools%2Fcalendar"));
    expect(screen.queryByText("Private app")).toBeNull();
  });

  it("retries a profile load without exposing an empty setup form", async () => {
    state.api.getProfile.mockRejectedValueOnce(new Error("offline"));
    render(
      <AppProviders>
        <OnboardingPage />
      </AppProviders>,
    );
    await screen.findByRole("alert");
    expect(screen.queryByText("Let's customize your experience")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Welcome to Reodite" });
    expect(state.api.saveProfile).not.toHaveBeenCalled();
  });

  it.each(["guest", "signedOut"])("bypasses profile loading for %s", async (kind) => {
    state.auth.isGuest = kind === "guest";
    state.auth.status = kind === "guest" ? "signedIn" : "signedOut";
    render(
      <AppProviders>
        <OnboardingPage />
      </AppProviders>,
    );
    await waitFor(() =>
      expect(state.router.replace).toHaveBeenCalledWith(
        kind === "guest" ? "/tools" : "/login?redirect=%2Ftools%2Fcalendar",
      ),
    );
    expect(state.api.getProfile).not.toHaveBeenCalled();
  });

  it("loads onboarding values in Settings and preserves completion when editing", async () => {
    const profile: StudentProfile = {
      preferred_name: "Sam",
      program: "Arts",
      year: 2,
      theme: "dark",
      student_type: "domestic",
      onboarding_completed: true,
    };
    state.pathname = "/settings";
    state.api.getProfile.mockResolvedValue({ profile });
    render(
      <AppProviders>
        <SettingsPage />
      </AppProviders>,
    );
    const field = await screen.findByLabelText("What should we call you?");
    expect((field as HTMLInputElement).value).toBe("Sam");
    expect((screen.getByLabelText("Dark") as HTMLInputElement).checked).toBe(true);
    fireEvent.change(field, { target: { value: "Alex" } });
    fireEvent.click(screen.getByLabelText("Light"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Saved");
    expect(state.api.saveProfile).toHaveBeenCalledWith({ ...profile, preferred_name: "Alex", theme: "light" });
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
