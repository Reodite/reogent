// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShellLayout from "./layout";

const state = vi.hoisted(() => ({
  auth: { status: "signedIn" as "initializing" | "signedIn" | "signedOut", isGuest: false },
  pathname: "/chat",
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
  state.pathname = "/chat";
  state.replace.mockReset();
});

describe("ShellLayout route guards", () => {
  it("keeps the shell-shaped loader while auth initializes", () => {
    state.auth = { status: "initializing", isGuest: false };
    const { container, queryByTestId } = render(<ShellLayout>chat</ShellLayout>);

    expect(container.querySelector("[data-loading-path='/chat']")).not.toBeNull();
    expect(queryByTestId("shell")).toBeNull();
  });

  it("shows the Tools loader while redirecting a guest-only route", () => {
    state.auth = { status: "signedIn", isGuest: true };
    const { container, queryByTestId } = render(<ShellLayout>chat</ShellLayout>);

    expect(container.querySelector("[data-loading-path='/tools/map']")).not.toBeNull();
    expect(queryByTestId("shell")).toBeNull();
    expect(state.replace).toHaveBeenCalledWith("/tools/map");
  });

  it("renders the signed-in destination without a loading interstitial", () => {
    const { getByTestId } = render(<ShellLayout>chat</ShellLayout>);

    expect(getByTestId("shell").textContent).toBe("chat");
    expect(state.replace).not.toHaveBeenCalled();
  });
});
