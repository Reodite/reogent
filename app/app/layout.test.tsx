// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShellLayout from "./layout";

const state = vi.hoisted(() => ({
  auth: { status: "signedIn" as "initializing" | "signedIn" | "signedOut", isGuest: false },
  pathname: "/app",
  replace: vi.fn(),
}));

vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => state.auth }));
vi.mock("@/src/components/chat/chat-shell-context", () => ({
  ChatShellProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock("@/src/components/shell/app-shell", () => ({
  AppShell: ({ children }: React.PropsWithChildren) => <div data-testid="shell">{children}</div>,
}));
vi.mock("@/src/components/shell/shell-loading", () => ({
  ShellBootLoading: ({ pathname }: { pathname?: string | null }) => <div data-loading-path={pathname} />,
}));
vi.mock("@/src/components/shell/shell-navigation", () => ({
  ShellNavigationProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: state.replace }),
}));

afterEach(() => {
  cleanup();
  state.auth = { status: "signedIn", isGuest: false };
  state.pathname = "/app";
  window.history.replaceState(null, "", "/");
  state.replace.mockReset();
});

describe("ShellLayout route guards", () => {
  it("keeps the shell-shaped loader while auth initializes", () => {
    state.auth = { status: "initializing", isGuest: false };
    const { container, queryByTestId } = render(<ShellLayout>chat</ShellLayout>);

    expect(container.querySelector("[data-loading-path='/app']")).not.toBeNull();
    expect(queryByTestId("shell")).toBeNull();
  });

  it.each(["/app", "/app/chat/session-123", "/app/pulse", "/app/pulse/schedule/ABC123"])(
    "sends guests from %s to app tools",
    (pathname) => {
      state.auth = { status: "signedIn", isGuest: true };
      state.pathname = pathname;
      const { container, queryByTestId } = render(<ShellLayout>chat</ShellLayout>);

      expect(container.querySelector("[data-loading-path='/app/tools/map']")).not.toBeNull();
      expect(queryByTestId("shell")).toBeNull();
      expect(state.replace).toHaveBeenCalledWith("/app/tools/map");
    },
  );

  it.each(["/app", "/app/pulse/schedule/ABC123"])("retains %s through sign in", (pathname) => {
    state.auth = { status: "signedOut", isGuest: false };
    state.pathname = pathname;
    window.history.replaceState(null, "", `${pathname}?view=week#schedule`);
    const { queryByTestId } = render(<ShellLayout>private workspace</ShellLayout>);

    expect(queryByTestId("shell")).toBeNull();
    expect(state.replace).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent(`${pathname}?view=week#schedule`)}`,
    );
  });

  it.each(["/app/tools/map", "/app/account", "/app/settings", "/app/about"])(
    "keeps guest-accessible %s in the shell",
    (pathname) => {
      state.auth = { status: "signedIn", isGuest: true };
      state.pathname = pathname;
      const { getByTestId } = render(<ShellLayout>guest workspace</ShellLayout>);

      expect(getByTestId("shell").textContent).toBe("guest workspace");
      expect(state.replace).not.toHaveBeenCalled();
    },
  );

  it("renders the signed-in destination without a loading interstitial", () => {
    const { getByTestId } = render(<ShellLayout>chat</ShellLayout>);

    expect(getByTestId("shell").textContent).toBe("chat");
    expect(state.replace).not.toHaveBeenCalled();
  });
});
