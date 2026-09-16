"use client";

import { ChatComposerFrame, ChatFrame } from "@/src/components/chat/chat-frame";
import { Icon } from "@/src/components/icons";
import { useMobileViewport } from "@/src/components/shell/use-mobile-viewport";
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { Skeleton, SkeletonText } from "@/src/components/ui/skeleton";
import { WorkspaceCanvas, WorkspacePage, WorkspacePanel, WorkspaceRail } from "@/src/components/ui/workspace";

const COMPOSER_SKELETON = (
  <ChatComposerFrame caption={<Skeleton className="mx-auto h-4 w-56" />}>
    <Skeleton className="h-14 w-full rounded-2xl" />
  </ChatComposerFrame>
);

/** Matches the empty-chat composition while the new-conversation route resolves. */
export function NewChatLoading() {
  return (
    <ChatFrame
      data-new-chat-loading
      role="status"
      aria-label="Loading new conversation"
      header={<Skeleton className="h-5 w-32 rounded-md" />}
      footer={COMPOSER_SKELETON}
    >
      <div className="flex min-h-full flex-col px-3 text-center sm:px-6">
        <div className="m-auto flex w-full max-w-xl flex-col items-center">
          <Skeleton className="size-12 rounded-2xl" />
          <Skeleton className="mt-4 h-6 w-56 max-w-full rounded-md" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full rounded" />
          <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
            {["w-52", "w-44", "w-56", "w-48"].map((width) => (
              <Skeleton key={width} className={`h-11 rounded-full sm:h-8 ${width}`} />
            ))}
          </div>
        </div>
      </div>
    </ChatFrame>
  );
}

/** Reserves the message shapes shared by route and in-panel history loading. */
export function ChatMessagesSkeleton() {
  return (
    <div aria-hidden="true" className="flex h-full min-h-0 flex-col gap-6">
      <Skeleton className="h-12 w-3/5 self-end rounded-[16px_16px_5px_16px]" />
      <Skeleton className="h-20 w-4/5 rounded-[16px_16px_16px_5px]" />
    </div>
  );
}

/** Reserves the complete conversation panel while chat history resolves. */
export function ChatPanelLoading() {
  return (
    <ChatFrame
      data-chat-loading
      role="status"
      aria-label="Loading conversation"
      header={<Skeleton className="h-5 w-40 rounded-md" />}
      footer={COMPOSER_SKELETON}
    >
      <ChatMessagesSkeleton />
    </ChatFrame>
  );
}

/** Reserves the destination workspace composition while a shell route resolves. */
export function WorkspaceRouteLoading({
  label = "Loading workspace",
  composition = "single",
  controls = false,
}: {
  label?: string;
  composition?: "single" | "split";
  controls?: boolean;
}) {
  const toolbar = controls ? (
    <div
      data-workspace-loading-controls
      className="grid min-h-11 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-center gap-3"
    >
      <Skeleton className="h-11 w-72 rounded-lg" />
      <Skeleton className="h-11 w-44 justify-self-end rounded-lg" />
    </div>
  ) : undefined;
  const canvas = (
    <WorkspaceCanvas padding="md">
      <div aria-hidden="true" className="flex flex-col gap-4">
        <SkeletonText />
        <SkeletonText />
        <SkeletonText />
      </div>
    </WorkspaceCanvas>
  );
  return composition === "split" ? (
    <WorkspacePage
      loading
      title={label}
      composition="split"
      toolbar={toolbar}
      view="main"
      onViewChange={() => {}}
      mainLabel="Content"
      railLabel="Controls"
      rail={
        <WorkspaceRail>
          <WorkspacePanel title="Controls">
            <div aria-hidden="true" className="flex flex-col gap-3">
              <Skeleton className="h-11 w-full rounded-lg" />
              <SkeletonText />
              <SkeletonText />
            </div>
          </WorkspacePanel>
        </WorkspaceRail>
      }
    >
      {canvas}
    </WorkspacePage>
  ) : (
    <WorkspacePage loading title={label} composition="single" toolbar={toolbar}>
      {canvas}
    </WorkspacePage>
  );
}

/** Preserves the Answer Canvas footprint without exposing stale pane content. */
export function AnswerCanvasLoading() {
  return (
    <section
      data-answer-canvas-loading
      role="status"
      aria-label="Loading answer canvas"
      className="neu-panel bg-surface flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl"
    >
      <header className="flex h-15 shrink-0 items-center gap-3 px-4">
        <Skeleton className="size-7 rounded-lg" />
        <Skeleton className="h-4 w-28 rounded" />
      </header>
      <div className="min-h-0 flex-1 p-3">
        <Skeleton className="h-full w-full rounded-xl" />
      </div>
    </section>
  );
}

/** Matches shell geometry during local-auth hydration instead of painting a blank page. */
export function ShellBootLoading({ pathname = "/chat" }: { pathname?: string }) {
  const viewportRef = useMobileViewport();
  const mode = pathname.startsWith("/tools")
    ? "tools"
    : pathname.startsWith("/pulse")
      ? "unity"
      : pathname === "/settings"
        ? "settings"
        : "ai";

  const splitWorkspace =
    mode === "settings" ||
    pathname === "/tools/map" ||
    pathname === "/tools/calendar" ||
    pathname === "/tools/planner" ||
    pathname.startsWith("/tools/schedule") ||
    pathname.startsWith("/pulse/schedule");
  const workspaceControls =
    pathname === "/tools/calendar" ||
    pathname === "/tools/planner" ||
    pathname.startsWith("/tools/schedule") ||
    pathname.startsWith("/pulse/schedule");

  const sidebarToggle = (
    <span
      aria-hidden="true"
      className="shell-boot-menu shell-menu-trigger text-on-surface-variant inline-flex size-11 shrink-0 items-center justify-center"
    >
      <Icon name="menu" size={22} />
    </span>
  );

  return (
    <div
      ref={viewportRef}
      data-shell-boot-loading
      data-shell-boot-mode={mode}
      aria-busy="true"
      className="app-shell-canvas app-shell-frame flex h-dvh flex-col overflow-hidden"
    >
      <div className="shell-body min-h-0 flex-1">
        <div className="chat-workspace shell-boot-layout relative min-h-0 min-w-0 flex-1">
          <aside className="sessions-aside shell-boot-sidebar absolute top-3 bottom-3 left-3 z-10 hidden min-h-0 w-68 overflow-hidden">
            <div data-shell-boot-frame className="neu-panel bg-surface flex h-full flex-col rounded-2xl p-2 pt-0">
              <div data-shell-boot-brand className="flex h-15 shrink-0 items-center gap-2 px-2">
                <Skeleton className="size-9 rounded-lg" />
                <Skeleton className="h-4 w-24 rounded" />
              </div>
              <Skeleton data-shell-boot-expand className="hidden size-9 self-center rounded-lg" />
              <div data-shell-boot-new className="hidden pb-3">
                <Skeleton className="h-11 w-full rounded-lg sm:h-9" />
              </div>
              <div
                data-shell-boot-list
                className="bg-surface-container-low/60 flex min-h-0 flex-1 flex-col gap-2 rounded-2xl p-2"
              >
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-5/6 rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
              <div data-shell-boot-footer className="mt-2 flex flex-col gap-2">
                <div data-shell-boot-modes className="flex gap-1 rounded-xl p-1">
                  {[0, 1, 2].map((key) => (
                    <Skeleton key={key} className="h-9 flex-1 rounded-lg" />
                  ))}
                </div>
                <Skeleton data-shell-boot-account className="h-9 w-full rounded-lg" />
              </div>
            </div>
          </aside>
          <main className="shell-boot-main flex min-h-0 min-w-0 flex-1">
            <WorkspaceHostProvider
              host={mode === "ai" ? "chat" : mode === "unity" ? "unity" : mode === "settings" ? "settings" : "tools"}
              navigation={sidebarToggle}
            >
              <div className="workspace-surface flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <div className="shell-boot-chat h-full min-h-0 w-full">
                  {pathname === "/chat" ? <NewChatLoading /> : <ChatPanelLoading />}
                </div>
                <div className="shell-boot-workspace hidden h-full min-h-0 w-full">
                  <WorkspaceRouteLoading
                    composition={splitWorkspace ? "split" : "single"}
                    controls={workspaceControls}
                  />
                </div>
              </div>
            </WorkspaceHostProvider>
          </main>
        </div>
      </div>
      <div aria-hidden="true" data-mobile-navigation className="mobile-mode-bar shrink-0 sm:hidden">
        <div className="grid h-15 grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="flex flex-col items-center justify-center gap-1">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-3 w-8 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
