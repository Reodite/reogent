// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { Storage } from "happy-dom";
import { StrictMode, useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppAuthProvider, useAppAuth } from "./app-auth";

let auth: ReturnType<typeof useAppAuth>;
const fetchMock = vi.fn<typeof fetch>();

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

function token(userId: string, exp = 4_000_000_000) {
  return `header.${btoa(JSON.stringify({ sub: userId, exp }))}.signature`;
}

function response(userId: string) {
  return Response.json({ userId, username: userId, token: token(userId) });
}

function storeUser(userId: string, value = token(userId)) {
  localStorage.setItem("reodite.auth.token", value);
  localStorage.setItem("reodite.auth.user", JSON.stringify({ userId, username: userId }));
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new Storage());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

it("renders public children during SSR without opening a private session", () => {
  storeUser("stored-A");
  expect(renderToString(<App />)).toContain("Public content: <!-- -->initializing");
  expect(fetchMock).not.toHaveBeenCalled();
});

describe.each(["signIn", "register"] as const)("%s response validation", (method) => {
  it.each([null, false, 42, "not an object", []].map((body) => ({ body })))(
    "rejects parsed nonobject bodies: $body",
    async ({ body }) => {
      render(<App />);
      for (const status of [200, 400]) {
        fetchMock.mockResolvedValueOnce(Response.json(body, { status }));
        await act(async () => {
          expect(await auth[method]("student", "password")).toEqual({ error: "Invalid server response." });
        });
        expect(auth.status).toBe("signedOut");
        expect(localStorage.getItem("reodite.auth.token")).toBeNull();
      }
    },
  );

  it("rejects a token belonging to a different user", async () => {
    render(<App />);
    fetchMock.mockResolvedValueOnce(Response.json({ userId: "B", username: "B", token: token("A") }));
    await act(async () => {
      expect(await auth[method]("B", "password")).toHaveProperty("error");
    });
    expect(auth.status).toBe("signedOut");
  });
});

it("rejects malformed and mismatched stored sessions", async () => {
  for (const value of ["invalid", token("B"), `header.${btoa("null")}.signature`]) {
    storeUser("A", value);
    const view = render(<App />);
    expect(auth.status).toBe("signedOut");
    expect(await auth.getToken()).toBeNull();
    view.unmount();
  }
});

it("revokes expired sessions and their old getter", async () => {
  storeUser("expired-A", token("expired-A", 1));
  render(<App />);
  const getter = auth.getToken;
  await act(async () => expect(await getter()).toBeNull());
  expect(auth.status).toBe("signedOut");
  expect(localStorage.getItem("reodite.auth.token")).toBeNull();
});

it("revokes a persisted session in memory even when removal fails", async () => {
  storeUser("remove-A");
  render(<App />);
  const getter = auth.getToken;
  vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
    throw new Error("Storage unavailable");
  });
  act(() => auth.signOut());
  expect(auth.status).toBe("signedOut");
  expect(await getter()).toBeNull();
});

it("keeps a partially persisted login in memory without borrowing old credentials", async () => {
  storeUser("partial-A");
  render(<App />);
  const oldGetter = auth.getToken;
  const setItem = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
    if (key === "reodite.auth.user") throw new Error("Quota exceeded");
    setItem(key, value);
  });
  fetchMock.mockResolvedValueOnce(response("partial-B"));
  await act(async () => expect(await auth.signIn("partial-B", "password")).toEqual({}));
  expect(await auth.getToken()).toBe(token("partial-B"));
  expect(await oldGetter()).toBeNull();
  act(() => auth.signOut());
  expect(auth.status).toBe("signedOut");
});

it.each(["signout", "cross-tab", "unmount"])("ignores a delayed login after %s", async (transition) => {
  storeUser("pending-A");
  const view = render(<App />);
  let resolve!: (response: Response) => void;
  fetchMock.mockReturnValueOnce(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const pending = auth.signIn("pending-B", "password");
  act(() => {
    if (transition === "signout") auth.signOut();
    else if (transition === "unmount") view.unmount();
    else {
      storeUser("tab-C");
      window.dispatchEvent(new StorageEvent("storage", { key: "reodite.auth.user" }));
    }
  });
  await act(async () => {
    resolve(response("pending-B"));
    expect(await pending).toHaveProperty("error");
  });
  expect(localStorage.getItem("reodite.auth.token")).not.toBe(token("pending-B"));
  if (transition === "cross-tab") expect(auth.user?.userId).toBe("tab-C");
});

it("remounts private descendant state on cross-tab identity changes before any foreign render", () => {
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
  const view = render(
    <AppAuthProvider>
      <GatedState />
    </AppAuthProvider>,
  );
  expect(view.getByRole("status").textContent).toBe("private content for state-A");
  act(() => {
    storeUser("state-B");
    window.dispatchEvent(new StorageEvent("storage", { key: "reodite.auth.user" }));
  });
  expect(renders.filter((entry) => entry.userId === "state-B")).toEqual([
    { userId: "state-B", privateState: "private content for state-B" },
  ]);
  expect(view.getByRole("status").textContent).toBe("private content for state-B");
  act(() => auth.continueAsGuest());
  expect(view.getByRole("status").textContent).toBe("private content for guest");
});

it("restores a usable session after Strict Mode effect replay", async () => {
  storeUser("strict-A");
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  expect(auth.status).toBe("signedIn");
  expect(await auth.getToken()).toBe(token("strict-A"));
});
