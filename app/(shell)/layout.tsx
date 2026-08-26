"use client";

// The shared shell for /chat and /tools: auth-gated sidebar and map. Routes in
// this group share the layout (and thus ChatShellProvider), so the map keeps
// its state across session and tool navigation.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { ChatShellProvider } from "@/src/components/chat/chat-shell-context";
import { AppShell } from "@/src/components/shell/app-shell";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ShellLayout({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const { isGuest } = useAppAuth();
  const router = useRouter();

  useEffect(() => {
    if (isGuest && (pathname?.startsWith("/chat") || pathname?.startsWith("/pulse"))) router.replace("/tools");
  }, [isGuest, pathname, router]);

  const initialMode = pathname?.startsWith("/tools") || isGuest ? "tools" : pathname?.startsWith("/pulse") ? "unity" : "ai";
  return (
    <ChatShellProvider initialMode={initialMode}>
      <AppShell>{children}</AppShell>
    </ChatShellProvider>
  );
}
