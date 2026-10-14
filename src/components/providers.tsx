"use client";

// App-wide client providers: theme (light/dark with system default), auth bridge,
// and the shared ChatApi instance.
import { AppAuthProvider, useAppAuth } from "@/src/components/auth/app-auth";
import { Button } from "@/src/components/ui/button";
import { createChatApi, type ChatApi } from "@/src/lib/api";
import { THEME_STORAGE_KEY } from "@/src/lib/theme";
import { parseProfile, type StudentProfile, type ThemeMode } from "@/src/shared/profile";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// ---- Theme ----

export type { ThemeMode } from "@/src/shared/profile";
export type ResolvedTheme = ThemeMode;

interface ThemeContextValue {
  theme: ResolvedTheme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "light", mode: "light", setMode: () => {} });
const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#f7f7f5", dark: "#121214" };

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    document.documentElement.dataset.theme = next;
    const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    if (metas.length === 0) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.append(meta);
      metas.push(meta);
    }
    for (const meta of metas) meta.content = THEME_COLORS[next];
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Keep the choice in memory when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    // Read preferences after hydration without replacing the pre-paint theme.
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Use the device's initial appearance when storage is unavailable.
    }
    setMode(stored === "light" || stored === "dark" ? stored : systemTheme());
  }, [setMode]);

  const value = useMemo(() => ({ theme: mode, mode, setMode }), [mode, setMode]);
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
  const { getToken, signOut, isGuest, user } = useAppAuth();

  const api = useMemo(() => {
    try {
      return createChatApi({
        getToken,
        onUnauthorized: () => {
          if (!isGuest) signOut();
        },
      });
    } catch (e) {
      console.error("Failed to create API client:", e);
      return null;
    }
  }, [getToken, signOut, isGuest]);

  if (!api) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-center">
        <p className="text-on-surface-variant text-sm">Failed to initialize. Please reload the page.</p>
      </div>
    );
  }

  return (
    <ApiContext.Provider value={api}>
      <ProfileProvider key={user?.userId ?? "signed-out"}>{children}</ProfileProvider>
    </ApiContext.Provider>
  );
}

interface ProfileContextValue {
  profile: StudentProfile | null;
  saveProfile: (profile: StudentProfile) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/** Shares the signed-in account's saved profile across onboarding and Account. */
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
    },
    [api],
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
            <Button size="field" shadowOn="background" onClick={() => setStatus("loading")}>
              Try again
            </Button>
            <Button variant="ghost" size="field" shadowOn="background" onClick={auth.signOut}>
              Sign out
            </Button>
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
