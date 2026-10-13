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

const TOKEN_KEY = "reodite.auth.token";
const USER_KEY = "reodite.auth.user";

type AppAuthStatus = "initializing" | "signedOut" | "signedIn";

interface AppAuthUser {
  username: string;
  userId: string;
}

interface AuthSession {
  user: AppAuthUser;
  token: string;
  persisted: boolean;
}

interface AppAuth {
  status: AppAuthStatus;
  user: AppAuthUser | null;
  isGuest: boolean;
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  register: (username: string, password: string) => Promise<{ error?: string }>;
  signOut: () => void;
  /** Returns only this session's token; revoked closures return null. */
  getToken: () => Promise<string | null>;
  continueAsGuest: () => void;
}

const INITIALIZING: AppAuth = {
  status: "initializing",
  user: null,
  isGuest: false,
  signIn: async () => ({}),
  register: async () => ({}),
  signOut: () => {},
  getToken: async () => null,
  continueAsGuest: () => {},
};

const AppAuthContext = createContext<AppAuth>(INITIALIZING);

export function useAppAuth(): AppAuth {
  return useContext(AppAuthContext);
}

function tokenPayload(token: string): { sub?: unknown; exp?: unknown } {
  return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
}

function tokenMatchesUser(token: string, userId: string): boolean {
  if (userId === "guest") return token === "guest";
  try {
    // This checks local identity consistency, not the server's JWT signature.
    return tokenPayload(token).sub === userId;
  } catch {
    return false;
  }
}

function loadStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    const user = raw ? JSON.parse(raw) : null;
    const token = localStorage.getItem(TOKEN_KEY);
    if (
      !user ||
      typeof user.username !== "string" ||
      typeof user.userId !== "string" ||
      !user.userId ||
      !token ||
      !tokenMatchesUser(token, user.userId)
    )
      return null;
    return { user: { username: user.username, userId: user.userId }, token, persisted: true };
  } catch {
    return null;
  }
}

function matchesStoredSession(session: AuthSession): boolean {
  const stored = loadStoredSession();
  return stored?.token === session.token && stored.user.userId === session.user.userId;
}

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

  const refreshSession = useCallback(() => {
    const next = loadStoredSession();
    const current = activeSession.current;
    // Browsers can deliver both key notifications after the complete session write.
    if (
      current?.persisted &&
      next &&
      current.token === next.token &&
      current.user.userId === next.user.userId &&
      current.user.username === next.user.username
    )
      return;
    publishSession(next);
  }, [publishSession]);

  useEffect(() => {
    refreshSession();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === TOKEN_KEY || event.key === USER_KEY) refreshSession();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      activeSession.current = undefined;
      generation.current += 1;
    };
  }, [refreshSession]);

  const startSession = useCallback(
    (user: AppAuthUser, token: string) => {
      let persisted = false;
      try {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        persisted = true;
      } catch {
        // Retain the token in memory when browser storage is unavailable.
      }
      publishSession({ user, token, persisted });
    },
    [publishSession],
  );

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
      let body: Record<string, unknown>;
      try {
        body = await res.json();
      } catch {
        return { error: "Unexpected response from server. Try again in a moment." };
      }
      if (attempt !== generation.current) return { error: "Sign-in changed. Try again." };
      if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid server response." };
      if (!res.ok) return { error: typeof body.error === "string" ? body.error : "Sign-in failed. Try again." };
      if (
        typeof body.token !== "string" ||
        typeof body.username !== "string" ||
        typeof body.userId !== "string" ||
        !body.userId ||
        !tokenMatchesUser(body.token, body.userId)
      )
        return { error: "Invalid server response." };
      startSession({ username: body.username, userId: body.userId }, body.token);
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
  const continueAsGuest = useCallback(
    () => startSession({ username: "Guest", userId: "guest" }, "guest"),
    [startSession],
  );

  const signOut = useCallback(() => {
    if (activeSession.current !== session) return;
    if (session?.persisted) {
      if (!matchesStoredSession(session)) {
        refreshSession();
        return;
      }
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } catch {
        // Revoke the in-memory session even when storage cannot be cleared.
      }
    }
    publishSession(null);
  }, [session, publishSession, refreshSession]);

  const getToken = useCallback(async () => {
    if (!session || activeSession.current !== session) return null;
    if (session.persisted && !matchesStoredSession(session)) {
      refreshSession();
      return null;
    }
    if (session.token !== "guest") {
      const { exp } = tokenPayload(session.token);
      if (typeof exp === "number" && exp <= Date.now() / 1000) {
        signOut();
        return null;
      }
    }
    return session.token;
  }, [session, refreshSession, signOut]);

  const value = useMemo<AppAuth>(
    () => ({
      status: session === undefined ? "initializing" : session ? "signedIn" : "signedOut",
      user: session?.user ?? null,
      isGuest: session?.user.userId === "guest",
      signIn,
      register,
      signOut,
      getToken,
      continueAsGuest,
    }),
    [session, signIn, register, signOut, getToken, continueAsGuest],
  );

  return (
    <AppAuthContext.Provider value={value}>
      <Fragment key={session?.user.userId ?? null}>{children}</Fragment>
    </AppAuthContext.Provider>
  );
}
