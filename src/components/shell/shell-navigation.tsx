"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

const NAVIGATION_TIMEOUT_MS = 10_000;

type NavigationOptions = { scroll?: boolean };
type NavigationIntent = { href: string; pathname: string };

export interface ShellNavigationState {
  committedPathname: string;
  displayPathname: string;
  pending: boolean;
  target: string | null;
  push: (href: string, options?: NavigationOptions) => void;
  replace: (href: string, options?: NavigationOptions) => void;
}

const ShellNavigationContext = createContext<ShellNavigationState | null>(null);

function useRouterSafe(): ReturnType<typeof useRouter> | null {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: called unconditionally; the guard supports isolated component tests.
    return useRouter();
  } catch {
    return null;
  }
}

function usePathnameSafe(): string {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: called unconditionally; the guard supports partial navigation mocks.
    return usePathname() ?? "";
  } catch {
    return "";
  }
}

function sameOriginPath(href: string): NavigationIntent | null {
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return { href: `${url.pathname}${url.search}${url.hash}`, pathname: url.pathname };
  } catch {
    return null;
  }
}

export function ShellNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const committedPathname = usePathname() ?? "";
  const committedRef = useRef(committedPathname);
  committedRef.current = committedPathname;
  const [intent, setIntent] = useState<NavigationIntent | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [, startTransition] = useTransition();

  const clearTimeoutRef = useCallback(() => {
    if (timeoutRef.current === null) return;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  useLayoutEffect(() => {
    if (!intent || intent.pathname !== committedPathname) return;
    clearTimeoutRef();
    setIntent(null);
  }, [clearTimeoutRef, committedPathname, intent]);

  useEffect(
    () => () => {
      clearTimeoutRef();
    },
    [clearTimeoutRef],
  );

  const navigate = useCallback(
    (method: "push" | "replace", href: string, options?: NavigationOptions) => {
      const next = sameOriginPath(href);
      if (!next || next.pathname === committedRef.current) {
        startTransition(() => (options ? router[method](href, options) : router[method](href)));
        return;
      }

      clearTimeoutRef();
      setIntent(next);
      timeoutRef.current = window.setTimeout(() => {
        setIntent((current) => (current?.href === next.href ? null : current));
        timeoutRef.current = null;
      }, NAVIGATION_TIMEOUT_MS);
      startTransition(() => (options ? router[method](next.href, options) : router[method](next.href)));
    },
    [clearTimeoutRef, router],
  );

  const push = useCallback((href: string, options?: NavigationOptions) => navigate("push", href, options), [navigate]);
  const replace = useCallback(
    (href: string, options?: NavigationOptions) => navigate("replace", href, options),
    [navigate],
  );
  const displayPathname = intent?.pathname ?? committedPathname;

  return (
    <ShellNavigationContext.Provider
      value={{
        committedPathname,
        displayPathname,
        pending: intent !== null,
        target: intent?.pathname ?? null,
        push,
        replace,
      }}
    >
      {children}
    </ShellNavigationContext.Provider>
  );
}

/** Uses shell navigation intent when provided and falls back to the App Router in isolated hosts. */
export function useShellNavigation(): ShellNavigationState {
  const context = useContext(ShellNavigationContext);
  const router = useRouterSafe();
  const pathname = usePathnameSafe();
  const push = useCallback(
    (href: string, options?: NavigationOptions) => (options ? router?.push(href, options) : router?.push(href)),
    [router],
  );
  const replace = useCallback(
    (href: string, options?: NavigationOptions) => (options ? router?.replace(href, options) : router?.replace(href)),
    [router],
  );
  return (
    context ?? {
      committedPathname: pathname,
      displayPathname: pathname,
      pending: false,
      target: null,
      push,
      replace,
    }
  );
}
