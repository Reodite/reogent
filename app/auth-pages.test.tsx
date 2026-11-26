// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./login/page";
import SignupPage from "./signup/page";

const navigation = vi.hoisted(() => ({ router: { replace: vi.fn() }, search: "" }));

vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ status: "signedOut", isGuest: false }),
}));
vi.mock("@/src/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation.router,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
    p: ({ children, ...props }: React.ComponentProps<"p">) => <p {...props}>{children}</p>,
  },
  useReducedMotion: () => true,
}));

afterEach(() => {
  cleanup();
  navigation.search = "";
  navigation.router.replace.mockReset();
});

describe.each([
  ["login", LoginPage],
  ["signup", SignupPage],
])("%s page", (_path, Page) => {
  it("offers Google sign-in and retains a safe destination", () => {
    navigation.search = new URLSearchParams({ redirect: "/app/settings" }).toString();
    render(<Page />);

    expect(screen.getByRole("link", { name: "Continue with Google" }).getAttribute("href")).toBe(
      "/api/auth/google?redirect=%2Fapp%2Fsettings",
    );
    expect(screen.queryByLabelText(/username|password/i)).toBeNull();
    expect(screen.getByText("Sign in or create an account with Google.")).not.toBeNull();
  });
});
