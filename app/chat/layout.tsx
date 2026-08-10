"use client";

// The /chat segment: auth-gated shell with sidebar and map. The layout persists
// across session navigation, so the map keeps its state while chats swap.
import { ChatShellProvider } from "@/src/components/chat/chat-shell-context";
import { AppShell } from "@/src/components/shell/app-shell";

export default function ChatLayout({ children }: LayoutProps<"/chat">) {
  return (
    <ChatShellProvider>
      <AppShell>{children}</AppShell>
    </ChatShellProvider>
  );
}
