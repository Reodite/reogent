"use client";

// App-wide client providers: theme (light/dark with system default), auth bridge,
// and the shared ChatApi instance.
import { AppAuthProvider, useAppAuth } from "@/src/components/auth/app-auth";
import { createChatApi, type ChatApi } from "@/src/lib/api";
import { THEME_STORAGE_KEY } from "@/src/lib/theme";
import { parseProfile, type StudentProfile, type ThemeMode } from "@/src/shared/profile";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// ---- Theme ----

export type { ThemeMode } from "@/src/shared/profile";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ResolvedTheme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "light", mode: "system", setMode: () => {} });

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

  return (
    <ApiContext.Provider value={api}>
      <ProfileProvider key={auth.user?.userId ?? "signed-out"}>{children}</ProfileProvider>
    </ApiContext.Provider>
  );
}

interface ProfileContextValue {
  profile: StudentProfile | null;
  saveProfile: (profile: StudentProfile) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/** Shares the signed-in account's saved profile across onboarding and Settings. */
export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useProfile must be used within <AppProviders>");
  return context;
}

function ProfileProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const auth = useAppAuth();
  const { setMode } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const signedIn = auth.status === "signedIn" && !auth.isGuest;
  const publicPage = pathname === "/" || pathname === "/login" || pathname === "/signup";
  const needsOnboarding = signedIn && status === "ready" && !profile?.onboarding_completed;

  useEffect(() => {
    if (!signedIn || status !== "loading") return;
    let cancelled = false;
    api.getProfile().then(
      ({ profile: saved }) => {
        if (cancelled) return;
        setProfile(saved);
        if (saved?.theme) setMode(saved.theme);
        setStatus("ready");
      },
      () => {
        if (!cancelled) setStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, signedIn, setMode, status]);

  useEffect(() => {
    if (!needsOnboarding || publicPage || pathname === "/onboarding") return;
    const destination = `${pathname}${window.location.search}${window.location.hash}`;
    router.replace(`/onboarding?redirect=${encodeURIComponent(destination)}`);
  }, [needsOnboarding, publicPage, pathname, router]);

  const saveProfile = useCallback(
    async (next: StudentProfile) => {
      const parsed = parseProfile(next);
      if (!parsed.ok) throw new Error(parsed.error);
      await api.saveProfile(parsed.value);
      setProfile(parsed.value);
      if (parsed.value.theme) setMode(parsed.value.theme);
    },
    [api, setMode],
  );
  const value = useMemo(() => ({ profile, saveProfile }), [profile, saveProfile]);

  if (!publicPage && signedIn && (status !== "ready" || (needsOnboarding && pathname !== "/onboarding"))) {
    return (
      <main className="auth-canvas flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
        <p role={status === "error" ? "alert" : "status"} className="text-on-surface-variant text-sm">
          {status === "error"
            ? "Couldn't load your profile. Check your connection and try again."
            : "Loading your profile…"}
        </p>
        {status === "error" && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStatus("loading")}
              className="neu-button h-11 rounded-xl px-4 text-sm"
            >
              Try again
            </button>
            <button type="button" onClick={auth.signOut} className="h-11 rounded-xl px-4 text-sm">
              Sign out
            </button>
          </div>
        )}
      </main>
    );
  }

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
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
