"use client";

import { Icon } from "@/src/components/icons";
import { announce } from "@/src/components/ui/live-region";
import type { Citation } from "@/src/shared/citations/citation";
import { safeSourceUrl } from "@/src/shared/citations/url";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/** Lists sources and reveals expansions without overriding intervening scrolling. */
export function SourcesPanel({ citations }: { citations: Citation[] | null | undefined }) {
  const ref = useRef<HTMLElement>(null);
  const cancelReveal = useRef<(() => void) | null>(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    void reducedMotion;
    return () => cancelReveal.current?.();
  }, [reducedMotion]);
  if (!Array.isArray(citations) || citations.length === 0) return null;

  const used = citations.filter((c) => c.used);
  const unused = citations.filter((c) => !c.used);

  const handleToggle = (event: React.ToggleEvent<HTMLDetailsElement>) => {
    cancelReveal.current?.();
    const details = event.currentTarget;
    announce(details.open ? "Sources panel expanded" : "Sources panel collapsed");
    if (!details.open) return;

    const controller = new AbortController();
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      controller.abort();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      if (cancelReveal.current === cancel) cancelReveal.current = null;
    };
    cancelReveal.current = cancel;
    for (const type of ["scroll", "wheel", "touchmove", "pointerdown", "keydown"] as const) {
      document.addEventListener(type, cancel, { capture: true, passive: true, signal: controller.signal });
    }
    frame = requestAnimationFrame(() => {
      let resizeTime = 0;
      if (!reducedMotion) {
        // Native details resizing can omit both animation handles and transition events.
        const style = window.getComputedStyle(details, "::details-content");
        const milliseconds = (value: string) =>
          (Number.parseFloat(value) || 0) * (value.trim().endsWith("ms") ? 1 : 1000);
        const durations = style.transitionDuration.split(",").map(milliseconds);
        const delays = style.transitionDelay.split(",").map(milliseconds);
        resizeTime = style.transitionProperty
          .split(",")
          .reduce(
            (longest, property, index) =>
              ["all", "block-size", "height"].includes(property.trim())
                ? Math.max(longest, durations[index % durations.length] + delays[index % delays.length])
                : longest,
            0,
          );
      }
      timer = setTimeout(() => {
        frame = requestAnimationFrame(() => {
          if (controller.signal.aborted) return;
          const panel = ref.current;
          cancel();
          if (details.open && panel?.isConnected) {
            panel.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
          }
        });
      }, resizeTime);
    });
  };

  return (
    <aside ref={ref} data-sources-panel className="mt-2">
      <details onToggle={handleToggle}>
        <summary className="focus-visible:ring-primary/40 hover:bg-surface-container/60 inline-flex min-h-11 list-none items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium select-none focus-visible:ring-2 focus-visible:ring-offset-1 [&::-webkit-details-marker]:hidden">
          <Icon name="down" size={14} className="transition-transform open:rotate-180" />
          {used.length > 0 ? `Sources used (${used.length})` : `Other retrieved context (${unused.length})`}
        </summary>
        <div className="bg-surface-container-low mt-2 flex max-h-64 flex-col gap-1.5 overflow-auto rounded-lg px-3 pt-1 pb-3">
          {used.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {used.map((c) => (
                <SourceRow key={c.index} c={c} />
              ))}
            </ul>
          )}
          {unused.length > 0 && (
            <>
              {used.length > 0 && (
                <div className="text-on-surface-variant pt-1 text-xs font-medium tracking-[0.05em] uppercase">
                  Other retrieved context
                </div>
              )}
              <ul className="flex flex-col gap-1.5">
                {unused.map((c) => (
                  <SourceRow key={c.index} c={c} />
                ))}
              </ul>
            </>
          )}
        </div>
      </details>
    </aside>
  );
}

function SourceRow({ c }: { c: Citation }) {
  const url = safeSourceUrl(c.source_url);
  const detail = c.detail;
  return (
    <li
      data-citation-row={c.index}
      data-used={c.used ? "true" : "false"}
      className="flex min-w-0 items-start gap-1.5 text-xs"
    >
      <span className="text-muted shrink-0 font-mono">{c.index}.</span>
      <div className="flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]">
        <span className={c.used ? "text-on-surface" : "text-muted"}>{c.label}</span>
        {typeof detail?.source_modified_at === "string" ? (
          <span className="text-muted">
            Source updated{" "}
            <time dateTime={detail.source_modified_at} title={detail.source_modified_at}>
              {detail.source_modified_at.slice(0, 10)}
            </time>
          </span>
        ) : null}
        {typeof detail?.retrieved_at === "string" ? (
          <span className="text-muted">
            Retrieved{" "}
            <time dateTime={detail.retrieved_at} title={detail.retrieved_at}>
              {detail.retrieved_at.slice(0, 10)}
            </time>
          </span>
        ) : null}
        {detail?.source_context_required === true ? (
          <span className="text-muted">Review source conditions before using this rate.</span>
        ) : null}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open source"
            className="text-primary hover:text-primary/80 inline-flex min-h-11 min-w-11 items-center text-xs underline sm:min-h-9"
          >
            Source
          </a>
        )}
      </div>
    </li>
  );
}
