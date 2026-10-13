// @vitest-environment happy-dom
import type { AccountDetails } from "@/src/shared/profile";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountPage from "./page";

const api = vi.hoisted(() => ({ getAccount: vi.fn() }));
const auth = vi.hoisted(() => ({ isGuest: false, user: { username: "ada", userId: "u1" }, signOut: vi.fn() }));
vi.mock("@/src/components/providers", () => ({ useApi: () => api }));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => auth }));

const details: AccountDetails = {
  username: "ada",
  createdAt: "2025-09-01T12:00:00.000Z",
  profile: { preferred_name: "Ada", program: "Computer Science", year: 3, student_type: "international" },
  tokensSpent: 12345,
  tokenTrackingStartedAt: "2026-10-01T12:00:00.000Z",
  pulseQuestionsAnswered: 12,
};

beforeEach(() => {
  vi.resetAllMocks();
  auth.isGuest = false;
  api.getAccount.mockResolvedValue(details);
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
    expect(screen.getByRole("link", { name: "Edit profile" }).getAttribute("href")).toBe("/settings");
    expect(container.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-composition")).toBe("single");
    expect(container.querySelectorAll("main")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledOnce();
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

  it("does not request private details for a guest", () => {
    auth.isGuest = true;
    render(<AccountPage />);
    expect(screen.getByRole("heading", { name: "Guest session" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login?redirect=%2Faccount");
    expect(api.getAccount).not.toHaveBeenCalled();
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
