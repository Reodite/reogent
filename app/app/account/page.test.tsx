// @vitest-environment happy-dom
import type { AccountDetails } from "@/src/shared/profile";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountPage from "./page";

const api = vi.hoisted(() => ({ getAccount: vi.fn(), saveProfile: vi.fn() }));
const auth = vi.hoisted(() => ({ isGuest: false, user: { username: "ada", userId: "u1" }, signOut: vi.fn() }));
vi.mock("@/src/components/providers", () => ({
  useApi: () => api,
  useProfile: () => ({ saveProfile: api.saveProfile }),
  useTheme: () => ({ mode: "dark" }),
}));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => auth }));

const details: AccountDetails = {
  username: "ada",
  createdAt: "2025-09-01T12:00:00.000Z",
  profile: {
    preferred_name: "Ada",
    program: "Computer Science",
    year: 3,
    student_type: "international",
    theme: "light",
    onboarding_completed: true,
  },
  tokensSpent: 12345,
  tokenTrackingStartedAt: "2026-10-01T12:00:00.000Z",
  pulseQuestionsAnswered: 12,
};

beforeEach(() => {
  vi.resetAllMocks();
  auth.isGuest = false;
  api.getAccount.mockResolvedValue(details);
  api.saveProfile.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("Account", () => {
  it("shows identity, creation date, student profile, usage, and sign-out in one workspace", async () => {
    const { container } = render(<AccountPage />);
    expect(screen.getByRole("heading", { name: "Account", level: 1 })).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "Ada" })).not.toBeNull();
    expect(screen.getByText("@ada")).not.toBeNull();
    expect(screen.getByText("Account created").nextElementSibling?.querySelector("time")?.dateTime).toBe(
      details.createdAt,
    );
    expect(screen.getByText("Program").nextElementSibling?.textContent).toBe("Computer Science");
    expect(screen.getByText("Year of study").nextElementSibling?.textContent).toBe("3");
    expect(screen.getByText("Tuition defaults").nextElementSibling?.textContent).toBe("International student");
    expect(screen.getByText("Tokens spent").nextElementSibling?.textContent).toBe("12,345");
    expect(screen.getByText("Pulse questions answered").nextElementSibling?.textContent).toBe("12");
    expect(screen.getByText(/Earlier usage is unavailable/).querySelector("time")?.dateTime).toBe(
      details.tokenTrackingStartedAt,
    );
    expect(screen.getByRole("button", { name: "Edit profile" })).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Edit profile" })).toBeNull();
    expect(container.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-composition")).toBe("single");
    expect(container.querySelectorAll("main")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("edits student defaults in Account and updates the saved details", async () => {
    render(<AccountPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    const name = screen.getByLabelText("What should we call you?");
    expect(document.activeElement).toBe(name);
    for (const label of ["What should we call you?", "What are you studying?", "Year of study", "Tuition defaults"]) {
      expect(screen.getByLabelText(label).classList.contains("neu-shadow-on-surface-container-low")).toBe(true);
    }
    fireEvent.change(name, { target: { value: "  Grace  " } });
    fireEvent.change(screen.getByLabelText("What are you studying?"), { target: { value: "  Statistics  " } });
    fireEvent.change(screen.getByLabelText("Year of study"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Tuition defaults"), { target: { value: "domestic" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("heading", { name: "Grace" })).not.toBeNull();
    expect(api.saveProfile).toHaveBeenCalledExactlyOnceWith({
      ...details.profile,
      preferred_name: "Grace",
      program: "Statistics",
      year: 10,
      student_type: "domestic",
      theme: "dark",
    });
    expect(screen.getByText("Program").nextElementSibling?.textContent).toBe("Statistics");
    expect(screen.getByText("Year of study").nextElementSibling?.textContent).toBe("10");
    expect(screen.getByText("Tuition defaults").nextElementSibling?.textContent).toBe("Domestic student");
    expect(screen.getByText("Tokens spent").nextElementSibling?.textContent).toBe("12,345");
    expect(screen.getByRole("status").textContent).toBe("Saved");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit profile" }));
    expect(screen.queryByLabelText("What are you studying?")).toBeNull();
    expect(api.getAccount).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect((screen.getByLabelText("What should we call you?") as HTMLInputElement).value).toBe("Grace");
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("discards unsaved profile edits when cancelled", async () => {
    render(<AccountPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    fireEvent.change(screen.getByLabelText("What are you studying?"), { target: { value: "Statistics" } });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    fireEvent.click(cancel);

    expect(screen.getByText("Program").nextElementSibling?.textContent).toBe("Computer Science");
    expect(screen.queryByLabelText("What are you studying?")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit profile" }));
    expect(api.saveProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect((screen.getByLabelText("What are you studying?") as HTMLInputElement).value).toBe("Computer Science");
  });

  it("retains the draft after a failed save and allows another attempt", async () => {
    api.saveProfile.mockRejectedValueOnce(new Error("offline"));
    render(<AccountPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    const program = screen.getByLabelText("What are you studying?") as HTMLInputElement;
    fireEvent.change(program, { target: { value: "Statistics" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Couldn't save. Try again.")).not.toBeNull();
    expect(program.value).toBe("Statistics");
    expect(program.closest("fieldset")?.disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByText("Saved");
    expect(screen.getByText("Program").nextElementSibling?.textContent).toBe("Statistics");
    expect(api.saveProfile).toHaveBeenCalledTimes(2);
  });

  it("locks fields and cancellation while saving without clearing the draft", async () => {
    let finish: (() => void) | undefined;
    api.saveProfile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<AccountPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    const program = screen.getByLabelText("What are you studying?") as HTMLInputElement;
    fireEvent.change(program, { target: { value: "Statistics" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(program.closest("fieldset")?.disabled).toBe(true);
    expect(program.value).toBe("Statistics");
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect(program.closest("form")?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { name: "Sign out" })).not.toBeNull();
    fireEvent.submit(program.closest("form")!);
    expect(api.saveProfile).toHaveBeenCalledOnce();

    await act(async () => finish?.());
    expect(screen.getByText("Program").nextElementSibling?.textContent).toBe("Statistics");
    expect(screen.getByText("Saved").className).toContain("ui-notice-enter");
  });

  it("creates missing student defaults without inventing saved values", async () => {
    api.getAccount.mockResolvedValue({ ...details, profile: null });
    render(<AccountPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    expect((screen.getByLabelText("What should we call you?") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Year of study") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("What are you studying?"), { target: { value: "Mathematics" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByText("Saved");
    expect(api.saveProfile).toHaveBeenCalledExactlyOnceWith({ program: "Mathematics", theme: "dark" });
    expect(screen.getByText("Program").nextElementSibling?.textContent).toBe("Mathematics");
  });

  it("rejects invalid profile values without sending a save", async () => {
    render(<AccountPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    const year = screen.getByLabelText("Year of study") as HTMLInputElement;
    fireEvent.change(year, { target: { value: "11" } });
    fireEvent.submit(year.closest("form")!);
    expect(await screen.findByText("Couldn't save. Try again.")).not.toBeNull();
    expect(api.saveProfile).not.toHaveBeenCalled();
    expect(year.value).toBe("11");
  });

  it("reserves the details while loading without showing made-up usage", () => {
    api.getAccount.mockReturnValue(new Promise(() => {}));
    render(<AccountPage />);
    expect(screen.getByRole("status", { name: "Loading account details" })).not.toBeNull();
    expect(screen.queryByText("Tokens spent")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).not.toBeNull();
  });

  it("keeps sign-out available after a failed load and retries the details", async () => {
    api.getAccount.mockRejectedValueOnce(new Error("offline"));
    render(<AccountPage />);
    expect(await screen.findByText("Account details unavailable")).not.toBeNull();
    expect(screen.queryByText("Tokens spent")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Computer Science")).not.toBeNull();
    expect(api.getAccount).toHaveBeenCalledTimes(2);
  });

  it("shows empty saved fields and genuine zero usage without inventing a creation date", async () => {
    api.getAccount.mockResolvedValue({
      ...details,
      profile: null,
      createdAt: null,
      tokensSpent: 0,
      pulseQuestionsAnswered: 0,
    });
    render(<AccountPage />);
    expect(await screen.findByRole("heading", { name: "ada" })).not.toBeNull();
    expect(screen.getAllByText("Not set")).toHaveLength(3);
    expect(screen.getByText("Ask me when needed")).not.toBeNull();
    expect(screen.getByText("Account created").nextElementSibling?.textContent).toBe("Not available");
    expect(screen.getByText("Tokens spent").nextElementSibling?.textContent).toBe("0");
    expect(screen.getByText("Pulse questions answered").nextElementSibling?.textContent).toBe("0");
  });

  it("omits personalization and private requests for a guest", () => {
    auth.isGuest = true;
    render(<AccountPage />);
    expect(screen.getByRole("heading", { name: "Guest session" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login?redirect=%2Fapp%2Faccount");
    expect(api.getAccount).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Student profile" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Activity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull();
    expect(api.saveProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole("status", { name: "Loading account details" })).toBeNull();
    expect(screen.queryByText("@ada")).toBeNull();
    expect(screen.queryByText("Computer Science")).toBeNull();
    expect(screen.queryByText("Tokens spent")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("announces sign-out failure and allows another attempt", async () => {
    auth.signOut.mockImplementationOnce(() => {
      throw new Error("storage error");
    });
    render(<AccountPage />);
    await screen.findByText("Computer Science");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByRole("alert").textContent).toBe("Couldn't sign out. Try again.");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(auth.signOut).toHaveBeenCalledTimes(2);
  });

  it("ignores a previous account's pending details after auth remounts the page", async () => {
    let finish: ((details: AccountDetails) => void) | undefined;
    api.getAccount.mockImplementationOnce(
      () =>
        new Promise<AccountDetails>((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<AccountPage key="first-account" />);
    api.getAccount.mockResolvedValue({ ...details, username: "second-user", profile: null });
    view.rerender(<AccountPage key="second-account" />);
    await screen.findByText("@second-user");
    await act(async () => finish?.(details));
    await waitFor(() => expect(screen.queryByText("@ada")).toBeNull());
    expect(screen.getByText("@second-user")).not.toBeNull();
  });
});
