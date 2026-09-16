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

function storeUser(isGuest = false) {
  localStorage.setItem("reodite.auth.token", isGuest ? "guest" : "token");
  localStorage.setItem(
    "reodite.auth.user",
    JSON.stringify({ username: isGuest ? "Guest" : "student", userId: isGuest ? "guest" : "student-id" }),
  );
}

function submitForm(action: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Username" }), { target: { value: " student " } });
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "secret" } });
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

  it("renders the auth-shaped frame during initialization", () => {
    const html = renderToString(
      <AppAuthProvider>
        <Page />
      </AppAuthProvider>,
    );
    expect(html).toContain(`aria-label="${loading}"`);
    expect(html).not.toContain('id="auth-username"');
    expect(html).toContain("sm:py-12");
    expect(html).toContain("ui-content-enter");
    expect(html).not.toContain('style="opacity:');
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it("keeps an accessible back arrow in sticky navigation outside the animated content", () => {
    const { container } = renderPage();
    const back = screen.getByRole("link", { name: "Back to home" });
    const nav = back.closest("nav");

    expect(back.getAttribute("href")).toBe("/");
    expect(back.getAttribute("title")).toBe("Back to home");
    expect(back.textContent).toBe("");
    expect(back.querySelector("svg")?.getAttribute("width")).toBe("20");
    expect(back.querySelector("svg")?.innerHTML).not.toBe("");
    expect(back.className).toContain("size-11");
    expect(back.classList.contains("neu-button")).toBe(false);
    expect(nav?.classList.contains("sticky")).toBe(true);
    expect(nav?.classList.contains("top-0")).toBe(true);
    expect(nav?.parentElement).toBe(container.querySelector(".auth-canvas"));
    expect(container.querySelector("[data-auth-content]")?.contains(nav)).toBe(false);
  });

  it.each([false, true])("redirects fresh authentication to settings once (guest=%s)", async (isGuest) => {
    if (isGuest) storeUser(true);
    setRedirect("/settings");
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
        body: JSON.stringify({ username: "student", password: "secret" }),
      }),
    );
    expect(navigation.router.replace).not.toHaveBeenCalled();
    respond(Response.json({ token: "token", username: "student", userId: "student-id" }));

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith("/settings"));
    expect(navigation.router.replace.mock.calls).toEqual([["/settings"]]);
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("status", { name: loading })).not.toBeNull();
  });

  it.each([undefined, "/settings", "/settings?tab=profile#name"])(
    "redirects an existing account to %s",
    async (redirect) => {
      if (redirect) setRedirect(redirect);
      storeUser();
      renderPage();
      await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith(redirect ?? "/chat"));
      expect(navigation.router.replace).toHaveBeenCalledTimes(1);
      expect(navigation.router.push).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.getByRole("status", { name: loading })).not.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("keeps forms available to guests and preserves the destination in cross-links", () => {
    storeUser(true);
    setRedirect("/settings?tab=profile#name");
    renderPage();
    expect(screen.getByRole("textbox", { name: "Username" })).not.toBeNull();
    expect(screen.getByRole("link", { name: link }).getAttribute("href")).toBe(
      `/${opposite}?redirect=${encodeURIComponent("/settings?tab=profile#name")}`,
    );
    expect(navigation.router.replace).not.toHaveBeenCalled();
    expect(navigation.router.push).not.toHaveBeenCalled();
  });

  it("shows failed authentication without navigating and restores focus", async () => {
    setRedirect("/settings");
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
  ])("uses /chat for missing or untrusted redirect %j", async (redirect) => {
    if (redirect !== undefined) setRedirect(redirect);
    fetchMock.mockResolvedValue(Response.json({ token: "token", username: "student", userId: "student-id" }));
    renderPage();
    expect(screen.getByRole("link", { name: link }).getAttribute("href")).toBe(`/${opposite}?redirect=%2Fchat`);
    submitForm(action);
    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith("/chat"));
    expect(navigation.router.replace).toHaveBeenCalledTimes(1);
    expect(navigation.router.push).not.toHaveBeenCalled();
  });
});
