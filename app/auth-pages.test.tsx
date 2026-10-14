// @vitest-environment happy-dom
import { AppAuthProvider } from "@/src/components/auth/app-auth";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Storage } from "happy-dom";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./login/page";
import SignupPage from "./signup/page";

const navigation = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn() },
  search: "",
}));
const fetchMock = vi.fn<typeof fetch>();

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

beforeEach(() => {
  vi.stubGlobal("localStorage", new Storage());
  localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  navigation.search = "";
});

function setRedirect(redirect: string) {
  navigation.search = new URLSearchParams({ redirect }).toString();
}

const studentToken = `header.${btoa(JSON.stringify({ sub: "student-id", exp: 4_000_000_000 }))}.signature`;

function storeUser(isGuest = false) {
  localStorage.setItem("reodite.auth.token", isGuest ? "guest" : studentToken);
  localStorage.setItem(
    "reodite.auth.user",
    JSON.stringify({ username: isGuest ? "Guest" : "student", userId: isGuest ? "guest" : "student-id" }),
  );
}

function submitForm(action: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Username" }), { target: { value: " student " } });
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "long-enough-password" } });
  fireEvent.click(screen.getByRole("button", { name: action }));
}

describe.each([
  {
    mode: "login",
    Page: LoginPage,
    action: "Sign in",
    loading: "Loading sign in",
    opposite: "signup",
    link: "Sign up",
  },
  {
    mode: "register",
    Page: SignupPage,
    action: "Create account",
    loading: "Loading sign up",
    opposite: "login",
    link: "Sign in",
  },
])("$mode page with AppAuthProvider", ({ mode, Page, action, loading, opposite, link }) => {
  function renderPage() {
    return render(
      <AppAuthProvider>
        <Page />
      </AppAuthProvider>,
    );
  }

  it("announces loading and withholds the form during initialization", () => {
    const html = renderToString(
      <AppAuthProvider>
        <Page />
      </AppAuthProvider>,
    );
    expect(html).toContain(`aria-label="${loading}"`);
    expect(html).not.toContain('id="auth-username"');
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it("provides an accessible home link", () => {
    renderPage();
    const back = screen.getByRole("link", { name: "Back to home" });

    expect(back.getAttribute("href")).toBe("/");
    expect(back.getAttribute("title")).toBe("Back to home");
  });

  it.each([false, true])("redirects fresh authentication to settings once (guest=%s)", async (isGuest) => {
    if (isGuest) storeUser(true);
    setRedirect("/app/settings");
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    renderPage();
    submitForm(action);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/auth/${mode}`,
      expect.objectContaining({
        body: JSON.stringify({ username: "student", password: "long-enough-password" }),
      }),
    );
    expect(navigation.router.replace).not.toHaveBeenCalled();
    respond(Response.json({ token: studentToken, username: "student", userId: "student-id" }));

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith("/app/settings"));
    expect(navigation.router.replace.mock.calls).toEqual([["/app/settings"]]);
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("status", { name: loading })).not.toBeNull();
  });

  it.each([undefined, "/app/settings", "/app/settings?tab=profile#name"])(
    "redirects an existing account to %s",
    async (redirect) => {
      if (redirect) setRedirect(redirect);
      storeUser();
      renderPage();
      await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith(redirect ?? "/app"));
      expect(navigation.router.replace).toHaveBeenCalledTimes(1);
      expect(navigation.router.push).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.getByRole("status", { name: loading })).not.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("keeps forms available to guests and preserves the destination in cross-links", () => {
    storeUser(true);
    setRedirect("/app/settings?tab=profile#name");
    renderPage();
    expect(screen.getByRole("textbox", { name: "Username" })).not.toBeNull();
    expect(screen.getByRole("link", { name: link }).getAttribute("href")).toBe(
      `/${opposite}?redirect=${encodeURIComponent("/app/settings?tab=profile#name")}`,
    );
    expect(navigation.router.replace).not.toHaveBeenCalled();
    expect(navigation.router.push).not.toHaveBeenCalled();
  });

  it("shows failed authentication without navigating and restores focus", async () => {
    setRedirect("/app/settings");
    fetchMock.mockResolvedValue(Response.json({ error: "Check your username and password." }, { status: 401 }));
    renderPage();
    submitForm(action);
    expect((await screen.findByRole("alert")).textContent).toBe("Check your username and password.");
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Username" }));
    expect(screen.getByRole("button", { name: action }).hasAttribute("disabled")).toBe(false);
    expect(navigation.router.replace).not.toHaveBeenCalled();
    expect(navigation.router.push).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "",
    "https://evil.example/settings",
    "javascript:alert(1)",
    "settings",
    "//evil.example/settings",
    "/\\evil.example/settings",
    "/\n/evil.example/settings",
    "/\r/evil.example/settings",
    "/\t/evil.example/settings",
    "/\u0000/evil.example/settings",
    "/settings\u007f",
    "/login",
    "/signup?redirect=/settings",
    "/onboarding?redirect=/tools",
  ])("uses /app for missing or untrusted redirect %j", async (redirect) => {
    if (redirect !== undefined) setRedirect(redirect);
    fetchMock.mockResolvedValue(Response.json({ token: studentToken, username: "student", userId: "student-id" }));
    renderPage();
    expect(screen.getByRole("link", { name: link }).getAttribute("href")).toBe(`/${opposite}?redirect=%2Fapp`);
    submitForm(action);
    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith("/app"));
    expect(navigation.router.replace).toHaveBeenCalledTimes(1);
    expect(navigation.router.push).not.toHaveBeenCalled();
  });
});
