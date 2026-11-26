// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthForm, AuthFormLoading } from "./auth-form";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => ({ status: "signedOut", isGuest: false }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: { p: ({ children, ...props }: React.ComponentProps<"p">) => <p {...props}>{children}</p> },
  useReducedMotion: () => true,
}));

afterEach(() => {
  cleanup();
  navigation.replace.mockReset();
  navigation.search = "";
});

describe("AuthForm", () => {
  it("offers Google sign-in and keeps a safe redirect", () => {
    navigation.search = new URLSearchParams({ redirect: "/app/settings" }).toString();
    const { container } = render(<AuthForm mode="login" />);

    expect(screen.getByRole("link", { name: "Continue with Google" }).getAttribute("href")).toBe(
      "/api/auth/google?redirect=%2Fapp%2Fsettings",
    );
    expect(container.querySelector("input, button[type=submit]")).toBeNull();
    expect(container.querySelector("[data-auth-error-slot]")?.className).toContain("min-h-8");
  });

  it("shows a provider configuration error", () => {
    navigation.search = new URLSearchParams({ error: "oauth_unavailable" }).toString();
    render(<AuthForm mode="login" />);

    expect(screen.getByRole("alert").textContent).toBe("Sign-in isn't set up on this server.");
  });

  it("matches the single-action loading footprint", () => {
    render(<AuthFormLoading label="Loading sign in" />);

    const loading = screen.getByRole("status", { name: "Loading sign in" });
    expect(loading.querySelectorAll("[data-auth-loading-action]")).toHaveLength(1);
    expect(loading.querySelector("[data-auth-loading-action]")?.className).toContain("h-12");
  });
});
