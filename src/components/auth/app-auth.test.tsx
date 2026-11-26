// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { Storage } from "happy-dom";
import { StrictMode, useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppAuthProvider, useAppAuth } from "./app-auth";

let auth: ReturnType<typeof useAppAuth>;
type User = { userId: string; username: string };
// The account the browser's session cookie belongs to; null means no cookie.
let cookieUser: User | null;
let sessionOffline: boolean;
let credentialResponse: (url: string, init?: RequestInit) => Promise<Response>;
const calls: string[] = [];

function Probe() {
  auth = useAppAuth();
  return <p>Public content: {auth.status}</p>;
}

function App() {
  return (
    <AppAuthProvider>
      <Probe />
    </AppAuthProvider>
  );
}

const user = (userId: string): User => ({ userId, username: userId });
const storeUser = (userId: string) => localStorage.setItem("reodite.auth.user", JSON.stringify(user(userId)));
const storedUserId = () => JSON.parse(localStorage.getItem("reodite.auth.user") ?? "null")?.userId ?? null;
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(() => {
  vi.stubGlobal("localStorage", new Storage());
  cookieUser = null;
  sessionOffline = false;
  credentialResponse = async () => new Response(null, { status: 404 });
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url === "/api/auth/session") {
        if (sessionOffline) throw new TypeError("Failed to fetch");
        return cookieUser ? Response.json(cookieUser) : new Response(null, { status: 204 });
      }
      if (url === "/api/auth/logout") {
        cookieUser = null;
        return new Response(null, { status: 204 });
      }
      if (url === "/api/auth/login" || url === "/api/auth/register") return credentialResponse(url, init);
      return new Response(null, { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("renders public children during SSR without opening a private session", () => {
  storeUser("stored-A");
  expect(renderToString(<App />)).toContain("Public content: <!-- -->initializing");
  expect(calls).toEqual([]);
});

describe("server session", () => {
  it("adopts the cookie's account when nothing is stored", async () => {
    cookieUser = user("cookie-A");
    render(<App />);
    expect(auth.status).toBe("initializing");
    await settle();
    expect(auth.user?.userId).toBe("cookie-A");
    expect(storedUserId()).toBe("cookie-A");
    expect(await auth.getUserId()).toBe("cookie-A");
  });

  it("shows the stored account at once and signs out when the cookie has expired", async () => {
    storeUser("expired-A");
    render(<App />);
    expect(auth.user?.userId).toBe("expired-A");
    const getter = auth.getUserId;
    await settle();
    expect(auth.status).toBe("signedOut");
    expect(storedUserId()).toBeNull();
    expect(await getter()).toBeNull();
  });

  it("switches to the cookie's account when it differs from the stored one", async () => {
    storeUser("stale-A");
    cookieUser = user("fresh-B");
    render(<App />);
    await settle();
    expect(auth.user?.userId).toBe("fresh-B");
    expect(storedUserId()).toBe("fresh-B");
  });

  it("keeps the stored account while the server is unreachable", async () => {
    storeUser("offline-A");
    sessionOffline = true;
    render(<App />);
    await settle();
    expect(auth.user?.userId).toBe("offline-A");
  });

  it("signs out an empty browser while the server is unreachable", async () => {
    sessionOffline = true;
    render(<App />);
    await settle();
    expect(auth.status).toBe("signedOut");
  });

  it("deletes the readable token left by earlier versions", async () => {
    localStorage.setItem("reodite.auth.token", "header.payload.signature");
    render(<App />);
    await settle();
    expect(localStorage.getItem("reodite.auth.token")).toBeNull();
  });

  it("keeps a guest local until the browser holds an account session", async () => {
    storeUser("guest");
    render(<App />);
    await settle();
    expect(auth.isGuest).toBe(true);
    expect(await auth.getUserId()).toBe("guest");
    cookieUser = user("signed-in-elsewhere");
    act(() => auth.refresh());
    await settle();
    expect(auth.user?.userId).toBe("signed-in-elsewhere");
  });
});

it("posts credentials and publishes the returned account identity", async () => {
  render(<App />);
  await settle();
  let requestBody: unknown;
  credentialResponse = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    cookieUser = user("password-user");
    return Response.json(cookieUser);
  };

  await act(async () => {
    await expect(auth.signIn(" student ", "correct horse battery")).resolves.toEqual({});
  });
  expect(requestBody).toEqual({ username: "student", password: "correct horse battery" });
  expect(auth.user?.userId).toBe("password-user");
  expect(storedUserId()).toBe("password-user");
});

it("ends the server session on sign-out and revokes the old getter", async () => {
  storeUser("out-A");
  cookieUser = user("out-A");
  render(<App />);
  await settle();
  const getter = auth.getUserId;
  act(() => auth.signOut());
  await settle();
  expect(calls).toContain("/api/auth/logout");
  expect(cookieUser).toBeNull();
  expect(auth.status).toBe("signedOut");
  expect(storedUserId()).toBeNull();
  expect(await getter()).toBeNull();
});

it("revokes a persisted session in memory even when removal fails", async () => {
  storeUser("remove-A");
  cookieUser = user("remove-A");
  render(<App />);
  await settle();
  const getter = auth.getUserId;
  vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
    throw new Error("Storage unavailable");
  });
  act(() => auth.signOut());
  expect(auth.status).toBe("signedOut");
  expect(await getter()).toBeNull();
});

it("adopts another tab's account instead of signing it out from a stale tab", async () => {
  storeUser("stale-tab-A");
  cookieUser = user("stale-tab-A");
  render(<App />);
  await settle();
  // Another tab signs in as B; this tab has not processed the storage event yet.
  storeUser("other-tab-B");
  cookieUser = user("other-tab-B");
  expect(await auth.getUserId()).toBeNull();
  act(() => auth.signOut());
  await settle();
  expect(calls).not.toContain("/api/auth/logout");
  expect(auth.user?.userId).toBe("other-tab-B");
});

it("keeps a cookie-backed identity when local storage cannot persist it", async () => {
  storeUser("partial-A");
  cookieUser = user("partial-A");
  render(<App />);
  await settle();
  const oldGetter = auth.getUserId;
  vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("Quota exceeded");
  });
  cookieUser = user("partial-B");
  act(() => auth.refresh());
  await settle();
  expect(await auth.getUserId()).toBe("partial-B");
  expect(await oldGetter()).toBeNull();
});

it("remounts private descendant state on cross-tab identity changes before any foreign render", async () => {
  const renders: { userId: string; privateState: string }[] = [];
  function PrivateState() {
    const { user } = useAppAuth();
    const userId = user!.userId;
    const [privateState] = useState(() => `private content for ${userId}`);
    renders.push({ userId, privateState });
    return <output>{privateState}</output>;
  }
  function GatedState() {
    auth = useAppAuth();
    return auth.status === "signedIn" ? <PrivateState /> : null;
  }
  storeUser("state-A");
  cookieUser = user("state-A");
  const view = render(
    <AppAuthProvider>
      <GatedState />
    </AppAuthProvider>,
  );
  await settle();
  expect(view.getByRole("status").textContent).toBe("private content for state-A");
  act(() => {
    storeUser("state-B");
    cookieUser = user("state-B");
    window.dispatchEvent(new StorageEvent("storage", { key: "reodite.auth.user" }));
  });
  await settle();
  expect(renders.filter((entry) => entry.userId === "state-B")).toEqual([
    { userId: "state-B", privateState: "private content for state-B" },
  ]);
  expect(view.getByRole("status").textContent).toBe("private content for state-B");
  act(() => auth.continueAsGuest());
  expect(view.getByRole("status").textContent).toBe("private content for guest");
});

it("restores a usable session after Strict Mode effect replay", async () => {
  storeUser("strict-A");
  cookieUser = user("strict-A");
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await settle();
  expect(auth.status).toBe("signedIn");
  expect(await auth.getUserId()).toBe("strict-A");
});
