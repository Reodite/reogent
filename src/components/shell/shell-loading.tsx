import { Icon } from "@/src/components/icons";

function Skeleton({ className }: { className: string }) {
  return <span aria-hidden="true" className={`shell-skeleton block ${className}`} />;
}

/** Matches the empty-chat composition while the new-conversation route resolves. */
export function NewChatLoading() {
  return (
    <section
      data-new-chat-loading
      role="status"
      aria-label="Loading new conversation"
      className="neu-panel bg-surface flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl"
    >
      <header className="flex h-15 shrink-0 items-center px-4">
        <Skeleton className="h-5 w-32 rounded-md" />
      </header>
      <div className="chat-message-well min-h-0 flex-1 overflow-hidden p-4 sm:p-6">
        <div className="flex min-h-full flex-col px-3 text-center sm:px-6">
          <div className="m-auto flex w-full max-w-xl flex-col items-center">
            <Skeleton className="size-12 rounded-2xl" />
            <Skeleton className="mt-4 h-6 w-56 max-w-full rounded-md" />
            <Skeleton className="mt-2 h-4 w-80 max-w-full rounded" />
            <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
              {["w-52", "w-44", "w-56", "w-48"].map((width) => (
                <Skeleton key={width} className={`h-11 rounded-full ${width}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="shrink-0 px-3 pt-2 pb-4 sm:px-4">
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    </section>
  );
}

/** Reserves the complete conversation panel while chat history resolves. */
export function ChatPanelLoading() {
  return (
    <section
      data-chat-loading
      role="status"
      aria-label="Loading conversation"
      className="neu-panel bg-surface flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl"
    >
      <header className="flex h-15 shrink-0 items-center px-4">
        <Skeleton className="h-5 w-40 rounded-md" />
      </header>
      <div className="chat-message-well flex min-h-0 flex-1 flex-col gap-6 overflow-hidden p-4 sm:p-6">
        <Skeleton className="h-12 w-3/5 self-end rounded-[16px_16px_5px_16px]" />
        <Skeleton className="h-20 w-4/5 rounded-[16px_16px_16px_5px]" />
      </div>
      <div className="shrink-0 px-3 pt-2 pb-4 sm:px-4">
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    </section>
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
  const split = composition === "split";
  return (
    <section
      data-workspace-route-loading
      data-workspace-composition={composition}
      data-workspace-view={split ? "main" : undefined}
      role="status"
      aria-label={label}
      className="workspace-page h-full min-h-0 w-full min-w-0 overflow-hidden"
    >
      <div className="workspace-page-layout flex h-full min-h-0 flex-col gap-4 p-6">
        <header className="flex shrink-0 flex-col gap-3">
          <div className="flex min-h-12 flex-col justify-center gap-2">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-3 w-64 max-w-full rounded" />
          </div>
          {controls ? (
            <div data-workspace-loading-controls className="flex h-11 items-center justify-between gap-3">
              <Skeleton className="h-9 w-72 max-w-3/5 rounded-lg" />
              <Skeleton className="h-9 w-44 max-w-2/5 rounded-lg" />
            </div>
          ) : null}
        </header>
        {split ? (
          <fieldset
            data-workspace-view-toggle
            className="workspace-page-toggle neu-inset bg-surface-container-low h-13 shrink-0 gap-1 rounded-lg p-1"
          >
            <legend className="sr-only">Loading workspace view</legend>
            <Skeleton className="h-11 flex-1 rounded-md" />
            <Skeleton className="h-11 flex-1 rounded-md" />
          </fieldset>
        ) : null}
        <div className="workspace-page-body grid min-h-0 min-w-0 flex-1 gap-4">
          {split ? (
            <aside data-workspace-region="rail" className="workspace-page-region min-h-0 min-w-0">
              <div
                data-workspace-panel
                className="neu-panel bg-surface flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl"
              >
                <header className="flex h-12 shrink-0 items-center px-4">
                  <Skeleton className="h-4 w-28 rounded" />
                </header>
                <div className="border-border-subtle flex min-h-0 flex-1 flex-col gap-2 border-t p-3">
                  <Skeleton className="h-11 w-full rounded-lg" />
                  <Skeleton className="h-11 w-5/6 rounded-lg" />
                  <Skeleton className="h-11 w-2/3 rounded-lg" />
                </div>
              </div>
            </aside>
          ) : null}
          <div data-workspace-region="main" className="workspace-page-region min-h-0 min-w-0">
            <div
              data-workspace-canvas
              className="neu-inset neu-shadow-on-surface bg-surface-container-low flex h-full min-h-0 flex-col gap-3 rounded-xl p-4"
            >
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-5/6 rounded-lg" />
              <Skeleton className="h-11 w-2/3 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </section>
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

  return (
    <div
      data-shell-boot-loading
      data-shell-boot-mode={mode}
      aria-busy="true"
      className="app-shell-canvas bg-background flex h-svh flex-col overflow-hidden"
    >
      <span className="shell-boot-menu neu-panel bg-surface text-primary fixed top-3 left-3 z-40 flex size-11 items-center justify-center rounded-xl">
        <Icon name="school" size={18} />
      </span>
      <div className="shell-body min-h-0 flex-1">
        <div className="chat-workspace shell-boot-layout relative min-h-0 min-w-0 flex-1 p-3">
          <aside className="sessions-aside shell-boot-sidebar absolute top-3 bottom-3 left-3 z-10 hidden min-h-0 w-68 overflow-hidden">
            <div className="neu-panel bg-surface flex h-full flex-col rounded-2xl p-2 pt-0">
              <div data-shell-boot-brand className="flex h-15 shrink-0 items-center gap-2 px-2">
                <Skeleton className="size-9 rounded-lg" />
                <Skeleton className="h-4 w-24 rounded" />
              </div>
              {mode === "ai" ? (
                <div className="pb-3">
                  <Skeleton className="h-11 w-full rounded-lg" />
                </div>
              ) : null}
              <div className="bg-surface-container-low/60 flex min-h-0 flex-1 flex-col gap-2 rounded-xl p-2">
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-5/6 rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
              <div data-shell-boot-footer className="mt-2 flex flex-col gap-2">
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            </div>
          </aside>
          <main className="shell-boot-main flex min-h-0 min-w-0 flex-1">
            <div className="workspace-surface flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <div className="shell-boot-chat h-full min-h-0 w-full">
                {pathname === "/chat" ? <NewChatLoading /> : <ChatPanelLoading />}
              </div>
              <div className="shell-boot-workspace hidden h-full min-h-0 w-full">
                <WorkspaceRouteLoading composition={splitWorkspace ? "split" : "single"} controls={workspaceControls} />
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
