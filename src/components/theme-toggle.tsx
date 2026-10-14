"use client";

import { Icon, type IconName } from "@/src/components/icons";
import { useTheme, type ThemeMode } from "@/src/components/providers";
import { useCallback, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { flushSync } from "react-dom";

const OPTIONS: Array<{ mode: ThemeMode; label: string; icon: IconName }> = [
  { mode: "light", label: "Light", icon: "sun" },
  { mode: "dark", label: "Dark", icon: "moon" },
];
let activeTransition: { finished: Promise<void> } | undefined;

function applyWithRipple(event: MouseEvent<HTMLButtonElement>, apply: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply();
    return;
  }
  const root = document.documentElement;
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = event.detail ? event.clientX : bounds.left + bounds.width / 2;
  const y = event.detail ? event.clientY : bounds.top + bounds.height / 2;
  root.style.setProperty("--ripple-x", `${x}px`);
  root.style.setProperty("--ripple-y", `${y}px`);
  // Suppress per-element transitions while the root ripple animates.
  root.classList.add("vt-active");
  const transition = doc.startViewTransition(() => flushSync(apply));
  activeTransition = transition;
  void transition.finished
    .catch(() => {})
    .finally(() => {
      if (activeTransition !== transition) return;
      root.classList.remove("vt-active");
      activeTransition = undefined;
    });
}

/** Switches appearance in one pill with roving radio focus and a reduced-motion-aware ripple. */
export function ThemeToggle({ className = "", showLabels = false }: { className?: string; showLabels?: boolean }) {
  const { mode, setMode } = useTheme();
  const groupRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const index = OPTIONS.findIndex((option) => option.mode === mode);
      let next = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        next = (index + 1) % OPTIONS.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        next = (index - 1 + OPTIONS.length) % OPTIONS.length;
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const button = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next];
      button?.focus();
      button?.click();
    },
    [mode],
  );

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Appearance"
      onKeyDown={handleKeyDown}
      className={`neu-inset grid w-max shrink-0 grid-cols-2 gap-0.5 rounded-full p-1 ${className}`}
    >
      {OPTIONS.map((option) => {
        const selected = mode === option.mode;
        return (
          // biome-ignore lint/a11y/useSemanticElements: APG radio group pattern on styled buttons
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            tabIndex={selected ? 0 : -1}
            onClick={(event) => {
              if (!selected) applyWithRipple(event, () => setMode(option.mode));
            }}
            className={`focus-visible:ring-primary/40 flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 ${
              showLabels ? "h-11 min-w-24 px-4 text-sm" : "size-11 sm:size-8"
            } ${selected ? "neu-raised bg-surface text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
          >
            <Icon name={option.icon} size={16} />
            {showLabels ? option.label : null}
          </button>
        );
      })}
    </div>
  );
}
