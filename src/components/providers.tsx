"use client";

// App-wide client providers: theme (light/dark with system default), auth bridge,
// and the shared ChatApi instance.
import { AppAuthProvider, useAppAuth } from "@/src/components/auth/app-auth";
import { createChatApi, type ChatApi } from "@/src/lib/api";
import { THEME_STORAGE_KEY } from "@/src/lib/theme";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// ---- Theme ----

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ResolvedTheme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "light", mode: "system", setMode: () => {} });
const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#f7f7f5", dark: "#121214" };

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ThemeProvider({ children }: { children: ReactNode }) {
  // Initial values mirror what the pre-paint bootstrap script already applied,
  // so hydration never stomps a dark page with the light default.
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      return stored === "light" || stored === "dark" ? stored : "system";
    } catch {
      return "system";
    }
  });
  const [theme, setTheme] = useState<ResolvedTheme>(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    if (metas.length === 0) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.append(meta);
      metas.push(meta);
    }
    for (const meta of metas) meta.content = THEME_COLORS[theme];
  }, [theme]);

  useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(systemTheme());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    setTheme(next === "system" ? systemTheme() : next);
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference just won't persist.
    }
  }, []);

  const value = useMemo(() => ({ theme, mode, setMode }), [theme, mode, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ---- API ----

const ApiContext = createContext<ChatApi | null>(null);

export function useApi(): ChatApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used within <AppProviders>");
  return api;
}

function ApiProvider({ children }: { children: ReactNode }) {
  const auth = useAppAuth();
  const authRef = useRef(auth);
  authRef.current = auth;

  const api = useMemo(() => {
    try {
      return createChatApi({
        getToken: () => authRef.current.getToken(),
        onUnauthorized: () => {
          if (authRef.current.user?.userId !== "guest") authRef.current.signOut();
        },
      });
    } catch (e) {
      console.error("Failed to create API client:", e);
      return null;
    }
  }, []);

  if (!api) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-center">
        <p className="text-on-surface-variant text-sm">Failed to initialize. Please reload the page.</p>
      </div>
    );
  }

  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AppAuthProvider>
        <ApiProvider>{children}</ApiProvider>
      </AppAuthProvider>
    </ThemeProvider>
  );
}
