"use client";

import { Icon, type IconName } from "@/src/components/icons";
import { useTheme, type ThemeMode } from "@/src/components/providers";
import { useCallback, useRef } from "react";

const OPTIONS: Array<{ mode: ThemeMode; label: string; icon: IconName }> = [
  { mode: "light", label: "Light", icon: "sun" },
  { mode: "system", label: "Auto", icon: "computer" },
  { mode: "dark", label: "Dark", icon: "moon" },
];

/** Apply theme with a ripple view-transition from click origin, or instant fallback. */
function applyWithRipple(e: React.MouseEvent, apply: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply();
    return;
  }
  const root = document.documentElement;
  root.style.setProperty("--ripple-x", `${e.clientX}px`);
  root.style.setProperty("--ripple-y", `${e.clientY}px`);
  // Suppress per-element transitions so only the clip-path ripple animates
  root.classList.add("vt-active");
  const transition = doc.startViewTransition(apply);
  transition.finished.catch(() => {}).finally(() => root.classList.remove("vt-active"));
}

/**
 * Compact icon-only segmented theme toggle with ARIA radiogroup semantics,
 * roving tabindex, and a ripple view-transition on click.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, setMode } = useTheme();
  const groupRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = OPTIONS.findIndex((o) => o.mode === mode);
      let next = idx;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        next = (idx + 1) % OPTIONS.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        next = (idx - 1 + OPTIONS.length) % OPTIONS.length;
      } else {
        return;
      }
      e.preventDefault();
      setMode(OPTIONS[next].mode);
      const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      buttons?.[next]?.focus();
    },
    [mode, setMode],
  );

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Appearance"
      onKeyDown={handleKeyDown}
      className={`border-border-subtle neu-inset grid grid-cols-3 gap-0.5 rounded-xl border p-1 ${className}`}
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
            tabIndex={selected ? 0 : -1}
            onClick={(e) => applyWithRipple(e, () => setMode(option.mode))}
            className={`focus-visible:ring-primary/40 flex size-11 items-center justify-center rounded-lg text-xs font-medium transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 sm:size-8 ${
              selected ? "neu-raised bg-surface text-primary" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <Icon name={option.icon} size={15} />
          </button>
        );
      })}
    </div>
  );
}
