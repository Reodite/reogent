// @vitest-environment happy-dom
import AccountPage from "@/app/(shell)/account/page";
import OnboardingPage from "@/app/onboarding/page";
import { AppProviders } from "@/src/components/providers";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { AUDIO_STORAGE_KEY, siteAudio } from "@/src/lib/audio";
import type { StudentProfile } from "@/src/shared/profile";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/onboarding",
  search: "redirect=%2Ftools%2Fcalendar",
  auth: { status: "signedIn", isGuest: false, user: { userId: "u1", username: "sam" }, signOut: vi.fn() },
  router: { replace: vi.fn(), push: vi.fn() },
  api: { getAccount: vi.fn(), getProfile: vi.fn(), saveProfile: vi.fn() },
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
  document.documentElement.dataset.theme = "light";
  state.pathname = "/onboarding";
  state.search = "redirect=%2Ftools%2Fcalendar";
  state.auth = { status: "signedIn", isGuest: false, user: { userId: "u1", username: "sam" }, signOut: vi.fn() };
  state.api.getAccount.mockReset();
  state.api.getProfile.mockReset().mockResolvedValue({ profile: null });
  state.api.saveProfile.mockReset().mockResolvedValue(undefined);
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
  it("centers just the welcome title and subheading", async () => {
    await start();
    const heading = screen.getByRole("heading", { name: "Welcome to Reodite" });
    const welcome = heading.parentElement!;
    expect(welcome.classList.contains("text-center")).toBe(true);
    expect(welcome.classList.contains("justify-center")).toBe(true);
    expect(welcome.querySelectorAll("p")).toHaveLength(1);
    expect(welcome.querySelector("p")?.textContent).toBe("Let's customize your experience");
    expect(screen.queryByText(/Everything is optional/)).toBeNull();
    expect(screen.queryByText(/Tell us a little about yourself/)).toBeNull();
  });

  it.each([
    ["", true],
    ["1", true],
    ["10", true],
    ["0", false],
    ["11", false],
    ["2.5", false],
  ])("validates year %j before continuing: %s", async (year, valid) => {
    await start();
    next();
    const field = screen.getByRole("spinbutton", { name: "Year of study" }) as HTMLInputElement;
    expect(field.min).toBe("1");
    expect(field.max).toBe("10");
    expect(field.step).toBe("1");
    expect(field.placeholder).not.toContain("optional");
    fireEvent.change(field, { target: { value: year } });
    expect(field.checkValidity()).toBe(valid);
    next();
    expect(screen.queryByRole("heading", { name: "Make yourself at home" }) !== null).toBe(valid);
    expect(state.api.saveProfile).not.toHaveBeenCalled();
  });

  it("keeps entries across Next and Back, and saves all cards before continuing", async () => {
    await start();
    const back = screen.getByRole("button", { name: "Back to welcome" }) as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    expect(back.classList.contains("size-11")).toBe(true);
    expect(back.classList.contains("neu-button")).toBe(false);
    expect(back.querySelector("svg")?.getAttribute("width")).toBe("20");
    expect(screen.getByText("Let's customize your experience")).toBeTruthy();
    next();
    fireEvent.change(screen.getByLabelText("What should we call you?"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText("Year of study"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("What are you studying?"), { target: { value: "Computer Science" } });
    fireEvent.change(screen.getByRole("combobox", { name: /Tuition defaults/ }), {
      target: { value: "international" },
    });
    next();
    expect(screen.queryByLabelText("Tuition defaults")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("campus.theme")).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Back to personal details" }));
    expect((screen.getByLabelText("What should we call you?") as HTMLInputElement).value).toBe("Sam");
    expect((screen.getByRole("spinbutton", { name: "Year of study" }) as HTMLInputElement).value).toBe("3");
    expect((screen.getByLabelText("Tuition defaults") as HTMLSelectElement).value).toBe("international");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "A little about you" }));
    next();
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
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

  it("previews and retains the device volume across Preferences, Back, and finishing setup", async () => {
    const preview = vi.spyOn(siteAudio, "previewVolume").mockImplementation(() => {});
    await start();
    next();
    next();
    const slider = screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;
    expect(slider.step).toBe("10");
    expect(slider.value).toBe("0");
    expect(document.querySelectorAll("[data-volume-stop]")).toHaveLength(11);
    fireEvent.change(slider, { target: { value: "30" } });
    expect(preview).toHaveBeenCalledExactlyOnceWith(0, 30);
    fireEvent.click(screen.getByRole("button", { name: "Back to personal details" }));
    next();
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("30");
    expect(preview).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(state.router.replace).toHaveBeenCalledWith("/tools/calendar"));
    expect(JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY)!).volume).toBe(30);
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
    fireEvent.click(screen.getByRole("button", { name: "Back to personal details" }));
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
        theme: "light",
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

  it("loads onboarding values in Account and preserves completion when editing", async () => {
    const profile: StudentProfile = {
      preferred_name: "Sam",
      program: "Arts",
      year: 2,
      theme: "dark",
      student_type: "domestic",
      onboarding_completed: true,
    };
    state.pathname = "/account";
    state.api.getProfile.mockResolvedValue({ profile });
    state.api.getAccount.mockResolvedValue({
      username: "sam",
      createdAt: null,
      profile,
      tokensSpent: 0,
      tokenTrackingStartedAt: "2026-10-01T12:00:00.000Z",
      pulseQuestionsAnswered: 0,
    });
    render(
      <AppProviders>
        <ThemeToggle />
        <AccountPage />
      </AppProviders>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    const field = screen.getByLabelText("What should we call you?");
    expect((field as HTMLInputElement).value).toBe("Sam");
    expect(screen.getAllByRole("radiogroup", { name: "Appearance" })).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(field, { target: { value: "Alex" } });
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByText("Saved");
    expect(state.api.saveProfile).toHaveBeenCalledWith({ ...profile, preferred_name: "Alex", theme: "light" });
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("keeps a newer appearance choice and focus when an earlier Account save finishes", async () => {
    state.pathname = "/account";
    const profile = { theme: "light", onboarding_completed: true };
    state.api.getProfile.mockResolvedValue({ profile });
    state.api.getAccount.mockResolvedValue({
      username: "sam",
      createdAt: null,
      profile,
      tokensSpent: 0,
      tokenTrackingStartedAt: "2026-10-01T12:00:00.000Z",
      pulseQuestionsAnswered: 0,
    });
    let finishSave!: () => void;
    state.api.saveProfile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    render(
      <AppProviders>
        <ThemeToggle />
        <AccountPage />
      </AppProviders>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    const dark = screen.getByRole("radio", { name: "Dark" });
    dark.focus();
    fireEvent.click(dark);
    await act(async () => finishSave());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("campus.theme")).toBe("dark");
    expect(document.activeElement).toBe(dark);
    expect(state.api.saveProfile).toHaveBeenCalledWith({ theme: "light", onboarding_completed: true });
    expect(screen.queryByText("Saved")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByText("Saved");
    expect(state.api.saveProfile).toHaveBeenLastCalledWith({ theme: "dark", onboarding_completed: true });
  });
});
