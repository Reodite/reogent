"use client";

// The shared shell for /chat and /tools: auth-gated sidebar and map. Routes in
// this group share the layout (and thus ChatShellProvider), so the map keeps
// its state across session and tool navigation.
import { ChatShellProvider } from "@/src/components/chat/chat-shell-context";
import { AppShell } from "@/src/components/shell/app-shell";
import { usePathname } from "next/navigation";

export default function ShellLayout({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const initialMode = pathname?.startsWith("/tools") ? "tools" : "ai";
  return (
    <ChatShellProvider initialMode={initialMode}>
      <AppShell>{children}</AppShell>
    </ChatShellProvider>
  );
}
