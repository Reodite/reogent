"use client";

import { claimPlannerOwner, clearOwnedPlannerForGuest } from "@/src/components/degree-planner/planner-store";
import { claimScheduleOwner, clearOwnedScheduleForGuest } from "@/src/components/schedule-planner/schedule-store";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Holds the signed-in identity only. The session token lives in an httpOnly cookie.
const USER_KEY = "reodite.auth.user";
// Sessions before cookie auth stored a readable token here; the provider deletes it.
const LEGACY_TOKEN_KEY = "reodite.auth.token";

type AppAuthStatus = "initializing" | "signedOut" | "signedIn";

interface AppAuthUser {
  username: string;
  userId: string;
}

interface AuthSession {
  user: AppAuthUser;
  persisted: boolean;
}

interface AppAuth {
  status: AppAuthStatus;
  user: AppAuthUser | null;
  isGuest: boolean;
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  register: (username: string, password: string) => Promise<{ error?: string }>;
  /** Ends the session in this browser, including the server cookie. */
  signOut: () => void;
  /** Returns this session's user id for the X-Reodite-User header; revoked closures return null. */
  getUserId: () => Promise<string | null>;
  /** Re-reads the signed-in account from the server, for example after a 401. */
  refresh: () => void;
  continueAsGuest: () => void;
}

const INITIALIZING: AppAuth = {
  status: "initializing",
  user: null,
  isGuest: false,
  signIn: async () => ({}),
  register: async () => ({}),
  signOut: () => {},
  getUserId: async () => null,
  refresh: () => {},
  continueAsGuest: () => {},
};

const AppAuthContext = createContext<AppAuth>(INITIALIZING);

export function useAppAuth(): AppAuth {
  return useContext(AppAuthContext);
}

function parseUser(value: unknown): AppAuthUser | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { userId, username } = value as Record<string, unknown>;
  return typeof userId === "string" && userId && typeof username === "string" ? { userId, username } : null;
}

function loadStoredUser(): AppAuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? parseUser(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Writes or clears the stored identity. Returns false when browser storage refuses. */
function storeUser(user: AppAuthUser | null): boolean {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
    return true;
  } catch {
    return false;
  }
}

const sameUser = (a: AppAuthUser | null | undefined, b: AppAuthUser | null | undefined) =>
  a?.userId === b?.userId && a?.username === b?.username;

export function AppAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);
  const activeSession = useRef(session);
  const generation = useRef(0);

  const publishSession = useCallback((next: AuthSession | null) => {
    generation.current += 1;
    activeSession.current = next;
    // Clear private data before any descendant can render the new identity,
    // including transitions while either planner pane is unmounted.
    if (next && next.user.userId !== "guest") {
      claimPlannerOwner(next.user.userId);
      claimScheduleOwner(next.user.userId);
    } else {
      clearOwnedPlannerForGuest();
      clearOwnedScheduleForGuest();
    }
    setSession(next);
  }, []);

  const startSession = useCallback(
    (user: AppAuthUser | null) => {
      const persisted = storeUser(user);
      publishSession(user ? { user, persisted } : null);
    },
    [publishSession],
  );

  // Shows the stored identity at once, then lets the session cookie decide. Only a 401 or another
  // account changes it; a guest stays a guest while signed out; a network failure keeps the stored identity.
  const refreshSession = useCallback(async () => {
    const stored = loadStoredUser();
    const current = activeSession.current;
    if (stored ? !sameUser(current?.user, stored) : current) {
      publishSession(stored && { user: stored, persisted: true });
    }
    const attempt = ++generation.current;
    let server: AppAuthUser | null | undefined;
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (response.status === 401) server = null;
      else if (response.ok) server = parseUser(await response.json()) ?? undefined;
    } catch {
      // Offline or unreachable: requests still fail closed on the server.
    }
    if (attempt !== generation.current) return;
    const shown = activeSession.current;
    if (server === undefined || (server === null && shown?.user.userId === "guest")) {
      if (shown === undefined) publishSession(null);
      return;
    }
    if (shown === undefined || !sameUser(shown?.user, server)) startSession(server);
  }, [publishSession, startSession]);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
      // Storage unavailable; nothing to remove.
    }
    void refreshSession();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === USER_KEY) void refreshSession();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      activeSession.current = undefined;
      generation.current += 1;
    };
  }, [refreshSession]);

  const authenticate = useCallback(
    async (endpoint: "login" | "register", username: string, password: string) => {
      const attempt = ++generation.current;
      let res: Response;
      try {
        res = await fetch(`/api/auth/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
      } catch {
        return { error: "Can't reach the server. Check your connection and try again." };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { error: "Unexpected response from server. Try again in a moment." };
      }
      if (attempt !== generation.current) return { error: "Sign-in changed. Try again." };
      if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid server response." };
      if (!res.ok) {
        const { error } = body as Record<string, unknown>;
        return { error: typeof error === "string" ? error : "Sign-in failed. Try again." };
      }
      const user = parseUser(body);
      if (!user) return { error: "Invalid server response." };
      startSession(user);
      return {};
    },
    [startSession],
  );

  const signIn = useCallback(
    (username: string, password: string) => authenticate("login", username, password),
    [authenticate],
  );
  const register = useCallback(
    (username: string, password: string) => authenticate("register", username, password),
    [authenticate],
  );
  const continueAsGuest = useCallback(() => startSession({ username: "Guest", userId: "guest" }), [startSession]);
  const refresh = useCallback(() => void refreshSession(), [refreshSession]);

  const signOut = useCallback(() => {
    if (activeSession.current !== session) return;
    // Another tab switched accounts: the shared cookie now belongs to it, so adopt that account instead.
    if (session?.persisted && !sameUser(loadStoredUser(), session.user)) {
      void refreshSession();
      return;
    }
    if (session && session.user.userId !== "guest") {
      void fetch("/api/auth/logout", { method: "POST", keepalive: true }).catch(() => {});
    }
    startSession(null);
  }, [session, startSession, refreshSession]);

  const getUserId = useCallback(async () => {
    if (!session || activeSession.current !== session) return null;
    if (session.persisted && !sameUser(loadStoredUser(), session.user)) {
      void refreshSession();
      return null;
    }
    return session.user.userId;
  }, [session, refreshSession]);

  const value = useMemo<AppAuth>(
    () => ({
      status: session === undefined ? "initializing" : session ? "signedIn" : "signedOut",
      user: session?.user ?? null,
      isGuest: session?.user.userId === "guest",
      signIn,
      register,
      signOut,
      getUserId,
      refresh,
      continueAsGuest,
    }),
    [session, signIn, register, signOut, getUserId, refresh, continueAsGuest],
  );

  return (
    <AppAuthContext.Provider value={value}>
      <Fragment key={session?.user.userId ?? null}>{children}</Fragment>
    </AppAuthContext.Provider>
  );
}
