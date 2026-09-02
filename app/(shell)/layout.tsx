"use client";

// Authenticated app routes share one sidebar and ChatShellProvider so chat,
// tool, community, and Settings navigation retain their workspace state.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { ChatShellProvider } from "@/src/components/chat/chat-shell-context";
import { AppShell } from "@/src/components/shell/app-shell";
import { ShellBootLoading } from "@/src/components/shell/shell-loading";
import { ShellNavigationProvider } from "@/src/components/shell/shell-navigation";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ShellLayout({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const { isGuest, status } = useAppAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "signedOut") {
      router.replace("/login");
      return;
    }
    if (isGuest && (pathname?.startsWith("/chat") || pathname?.startsWith("/pulse"))) router.replace("/tools");
  }, [isGuest, pathname, router, status]);

  if (status !== "signedIn") return <ShellBootLoading pathname={pathname} />;

  const initialMode =
    pathname?.startsWith("/tools") || isGuest ? "tools" : pathname?.startsWith("/pulse") ? "unity" : "ai";
  return (
    <ShellNavigationProvider>
      <ChatShellProvider initialMode={initialMode}>
        <AppShell>{children}</AppShell>
      </ChatShellProvider>
    </ShellNavigationProvider>
  );
}
