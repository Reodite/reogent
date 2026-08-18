"use client";

// Auth context for the whole app: `useAppAuth()`.
// Stores JWT in localStorage. Login/register call /api/auth/* endpoints.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const TOKEN_KEY = "reodite.auth.token";
const USER_KEY = "reodite.auth.user";

type AppAuthStatus = "initializing" | "signedOut" | "signedIn";

interface AppAuthUser {
  username: string;
  userId: string;
}

interface AppAuth {
  status: AppAuthStatus;
  user: AppAuthUser | null;
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  register: (username: string, password: string) => Promise<{ error?: string }>;
  signOut: () => void;
  getToken: () => Promise<string | null>;
}

const INITIALIZING: AppAuth = {
  status: "initializing",
  user: null,
  signIn: async () => ({}),
  register: async () => ({}),
  signOut: () => {},
  getToken: async () => null,
};

const AppAuthContext = createContext<AppAuth>(INITIALIZING);

export function useAppAuth(): AppAuth {
  return useContext(AppAuthContext);
}

function loadStoredUser(): AppAuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AppAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppAuthUser | null | undefined>(undefined);

  useEffect(() => {
    setUser(loadStoredUser());
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    let res: Response;
    try {
      res = await fetch("/api/auth/login", {
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
    if (!res.ok) return { error: (body.error as string) ?? "Login failed. Check your username and password." };
    if (typeof body.token !== "string" || typeof body.username !== "string") {
      return { error: "Invalid server response." };
    }
    try {
      localStorage.setItem(TOKEN_KEY, body.token);
      const authUser: AppAuthUser = { username: body.username, userId: body.userId as string };
      localStorage.setItem(USER_KEY, JSON.stringify(authUser));
      setUser(authUser);
    } catch {
      // Storage unavailable (private browsing, quota) — use in-memory only
      const authUser: AppAuthUser = { username: body.username, userId: body.userId as string };
      setUser(authUser);
    }
    return {};
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    let res: Response;
    try {
      res = await fetch("/api/auth/register", {
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
    if (!res.ok) return { error: (body.error as string) ?? "Registration failed. The username may already be taken." };
    if (typeof body.token !== "string" || typeof body.username !== "string") {
      return { error: "Invalid server response." };
    }
    try {
      localStorage.setItem(TOKEN_KEY, body.token);
      const authUser: AppAuthUser = { username: body.username, userId: body.userId as string };
      localStorage.setItem(USER_KEY, JSON.stringify(authUser));
      setUser(authUser);
    } catch {
      const authUser: AppAuthUser = { username: body.username, userId: body.userId as string };
      setUser(authUser);
    }
    return {};
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // Storage inaccessible — clear in-memory state only
    }
    setUser(null);
  }, []);

  const getToken = useCallback(async () => {
    let token: string | null = null;
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
    if (!token) return null;
    // Check JWT expiry client-side before returning
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (typeof payload.exp === "number" && payload.exp < Date.now() / 1000) {
        // Expired — treat as signed out
        signOut();
        return null;
      }
    } catch {
      // Malformed token — still return it; server will reject
    }
    return token;
  }, [signOut]);

  const value = useMemo<AppAuth>(
    () => ({
      status: user === undefined ? "initializing" : user ? "signedIn" : "signedOut",
      user: user ?? null,
      signIn,
      register,
      signOut,
      getToken,
    }),
    [user, signIn, register, signOut, getToken],
  );

  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>;
}
