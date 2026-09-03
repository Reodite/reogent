// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthForm, AuthFormLoading } from "./auth-form";

const signIn = vi.hoisted(() => vi.fn());
const register = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ signIn, register }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    p: ({ children, ...props }: React.ComponentProps<"p">) => <p {...props}>{children}</p>,
  },
  useReducedMotion: () => true,
}));

afterEach(() => {
  cleanup();
  signIn.mockReset();
  register.mockReset();
  push.mockReset();
});

describe("AuthForm", () => {
  it("reserves a stable two-line feedback slot", async () => {
    signIn.mockResolvedValue({ error: "Check your username and password." });
    const { container } = render(<AuthForm mode="login" />);

    const slot = container.querySelector("[data-auth-error-slot]") as HTMLElement;
    expect(slot.className).toContain("min-h-8");
    fireEvent.change(screen.getByRole("textbox", { name: "Username" }), { target: { value: "student" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByRole("alert");
    expect(container.querySelector("[data-auth-error-slot]")).toBe(slot);
  });

  it("matches the loaded form footprint while authentication initializes", () => {
    render(<AuthFormLoading label="Loading sign in" />);

    const loading = screen.getByRole("status", { name: "Loading sign in" });
    expect(loading.className).toContain("max-w-80");
    expect(loading.querySelector("[data-auth-loading-action]")?.className).toContain("h-12");
    expect(loading.querySelector("[data-auth-loading-feedback]")?.className).toContain("h-8");
  });
});
