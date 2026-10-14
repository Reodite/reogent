"use client";

// Authenticated app routes share one sidebar and ChatShellProvider so chat,
// tool, community, and Settings navigation retain their workspace state.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { ChatShellProvider } from "@/src/components/chat/chat-shell-context";
import { AppShell } from "@/src/components/shell/app-shell";
import { ShellBootLoading } from "@/src/components/shell/shell-loading";
import { ShellNavigationProvider } from "@/src/components/shell/shell-navigation";
import { shellModeForPath } from "@/src/components/shell/use-shell-mode";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ShellLayout({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const { isGuest, status } = useAppAuth();
  const router = useRouter();

  const routedMode = shellModeForPath(pathname);
  const guestRedirecting = isGuest && (routedMode === "ai" || routedMode === "unity");

  useEffect(() => {
    if (status === "signedOut") {
      const destination = `${pathname}${window.location.search}${window.location.hash}`;
      router.replace(`/login?redirect=${encodeURIComponent(destination)}`);
      return;
    }
    if (guestRedirecting) router.replace("/app/tools/map");
  }, [guestRedirecting, pathname, router, status]);

  if (status !== "signedIn" || guestRedirecting) {
    return <ShellBootLoading pathname={guestRedirecting ? "/app/tools/map" : pathname} />;
  }

  const initialMode = isGuest ? "tools" : (routedMode ?? "ai");
  return (
    <ShellNavigationProvider>
      <ChatShellProvider initialMode={initialMode}>
        <AppShell>{children}</AppShell>
      </ChatShellProvider>
    </ShellNavigationProvider>
  );
}
