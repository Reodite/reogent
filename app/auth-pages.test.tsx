// @vitest-environment happy-dom
import { AuthPage } from "@/src/components/auth/auth-form";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./login/page";
import SignupPage from "./signup/page";

const navigation = vi.hoisted(() => ({ router: { replace: vi.fn() }, search: "", authMode: "oauth" }));

vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ status: "signedOut", isGuest: false }),
}));
vi.mock("@/src/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/src/server/auth-mode", () => ({ getAuthMode: () => navigation.authMode }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
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
  navigation.authMode = "oauth";
  navigation.router.replace.mockReset();
});

describe.each([
  ["login", "login" as const],
  ["signup", "signup" as const],
])("%s page", (_path, mode) => {
  it("offers Google sign-in and retains a safe destination", () => {
    navigation.search = new URLSearchParams({ redirect: "/app/settings" }).toString();
    render(<AuthPage mode={mode} authMode="oauth" providerIds={["google"]} />);

    expect(screen.getByRole("link", { name: "Continue with Google" }).getAttribute("href")).toBe(
      "/api/auth/google?redirect=%2Fapp%2Fsettings",
    );
    expect(screen.queryByLabelText(/username|password/i)).toBeNull();
    expect(screen.getByText("Sign in or create an account with a linked provider.")).not.toBeNull();
  });

  it("renders credential controls when the server selects password mode", () => {
    navigation.authMode = "password";
    render(<AuthPage mode={mode} authMode="password" />);

    expect(screen.getByRole("textbox", { name: "Username" })).not.toBeNull();
    expect(screen.getByLabelText(/Password/)).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
  });
});

it("passes the request-time mode into the login page", async () => {
  navigation.authMode = "password";
  const page = await LoginPage();

  expect(page.props).toMatchObject({ mode: "login", authMode: "password", providerIds: [] });
});

it("passes the request-time mode into the signup page", async () => {
  navigation.authMode = "oauth";
  const page = await SignupPage();

  expect(page.props).toMatchObject({ mode: "signup", authMode: "oauth", providerIds: ["google"] });
});
