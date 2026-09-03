// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./login/page";
import SignupPage from "./signup/page";

const auth = vi.hoisted(() => ({ status: "signedIn" as "initializing" | "signedIn" | "signedOut", isGuest: true }));
const replace = vi.hoisted(() => vi.fn());

vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => auth }));
vi.mock("@/src/components/auth/auth-form", () => ({
  AuthForm: ({ mode }: { mode: string }) => <div data-testid="auth-form">{mode}</div>,
  AuthFormLoading: ({ label }: { label: string }) => <div data-testid="auth-form-loading">{label}</div>,
}));
vi.mock("@/src/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => true,
}));

afterEach(() => {
  cleanup();
  auth.status = "signedIn";
  auth.isGuest = true;
  replace.mockReset();
});

describe("guest auth pages", () => {
  it("lets a guest open sign-in and signup forms", () => {
    const login = render(<LoginPage />);
    expect(screen.getByTestId("auth-form").textContent).toBe("login");
    expect(replace).not.toHaveBeenCalled();
    login.unmount();

    render(<SignupPage />);
    expect(screen.getByTestId("auth-form").textContent).toBe("signup");
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders an auth-shaped loading frame during initialization", () => {
    auth.status = "initializing";
    const { container } = render(<LoginPage />);

    expect(screen.queryByTestId("auth-form")).toBeNull();
    expect(screen.getByTestId("auth-form-loading")).not.toBeNull();
    expect(container.querySelector("[data-auth-content]")?.className).toContain("py-6");
    expect(container.querySelector("[data-auth-content]")?.className).toContain("sm:py-12");
  });

  it("redirects an authenticated account away from auth forms without a blank frame", () => {
    auth.isGuest = false;
    render(<LoginPage />);
    expect(screen.queryByTestId("auth-form")).toBeNull();
    expect(screen.getByTestId("auth-form-loading")).not.toBeNull();
    expect(replace).toHaveBeenCalledWith("/chat");
  });
});
