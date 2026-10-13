// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";

const signIn = vi.hoisted(() => vi.fn());
const register = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ status: "signedOut", isGuest: false, signIn, register }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

afterEach(() => {
  cleanup();
  signIn.mockReset();
  register.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
});

describe("AuthForm", () => {
  it("announces a failed sign-in response", async () => {
    signIn.mockResolvedValue({ error: "Check your username and password." });
    render(<AuthForm mode="login" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Username" }), { target: { value: "student" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Check your username and password.");
  });
});
