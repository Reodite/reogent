"use client";

// The composer "+" menu (REQ-4.3). A neumorphic affordance next to the chat
// textarea opens a popover listing PaneEntry.label rows. Non-prereq rows open
// the pane directly via setActiveChannel(id, defaultState). The Prereq Tree
// row reveals an inline code input before committing via setActiveChannel.
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { PANE_REGISTRY, type PaneEntry } from "@/src/components/shell/pane-registry";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type KeyboardEventGlobal = globalThis.KeyboardEvent;

export function ComposerToolsMenu() {
  const { setActiveChannel } = useChatShell();
  const [open, setOpen] = useState(false);
  const [prereqOpen, setPrereqOpen] = useState(false);
  const [code, setCode] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const prereqInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setPrereqOpen(false);
      }
    };
    const onKey = (event: KeyboardEventGlobal) => {
      if (event.key === "Escape") {
        if (prereqOpen) {
          setPrereqOpen(false);
          return;
        }
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, prereqOpen]);

  useEffect(() => {
    if (open && prereqOpen) prereqInputRef.current?.focus();
  }, [open, prereqOpen]);

  function selectPane(entry: PaneEntry) {
    setActiveChannel(entry.id, entry.defaultState);
    setOpen(false);
    setPrereqOpen(false);
  }

  function commitPrereq() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setActiveChannel("prereq-tree", { root: trimmed, selections: {} });
    setCode("");
    setOpen(false);
    setPrereqOpen(false);
  }

  function onPrereqKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitPrereq();
    } else if (event.key === "Escape") {
      event.stopPropagation();
      setPrereqOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative z-20 shrink-0">
      <button
        type="button"
        aria-label="Open tools"
        aria-haspopup="menu"
        aria-expanded={open}
        data-composer-tools-trigger
        onClick={() => {
          setOpen((v) => !v);
          setPrereqOpen(false);
        }}
        className="neu-button bg-surface text-on-surface-variant hover:text-primary grid size-11 min-h-[44px] min-w-[44px] place-items-center rounded-xl transition-colors sm:size-9"
      >
        <Icon name="add" size={18} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Tools"
          data-composer-tools-menu
          className="bg-surface-container-low border-border-subtle/60 absolute bottom-full left-0 z-30 mb-2 w-64 overflow-hidden rounded-xl border shadow-lg"
        >
          <ul className="flex flex-col py-1">
            {PANE_REGISTRY.map((entry) => {
              const isPrereq = entry.id === "prereq-tree";
              const Glyph = entry.icon;
              const activeRow = isPrereq && prereqOpen;
              return (
                <li key={entry.id} role="none" className="flex flex-col">
                  <button
                    type="button"
                    role="menuitem"
                    data-pane-id={entry.id}
                    data-prereq-open={activeRow ? "true" : "false"}
                    onClick={() => {
                      if (isPrereq) {
                        setPrereqOpen(true);
                        return;
                      }
                      selectPane(entry);
                    }}
                    className="text-on-surface hover:bg-accent-subtle/60 flex min-h-[44px] items-center gap-2.5 px-3 py-2 text-left text-sm"
                  >
                    <Glyph className="size-4 shrink-0" />
                    <span className="flex-1">{entry.label}</span>
                    {isPrereq && <Icon name="down" size={12} />}
                  </button>
                  {isPrereq && prereqOpen && (
                    <div className="border-border-subtle/40 flex items-center gap-1.5 border-t px-2 py-2">
                      <input
                        ref={prereqInputRef}
                        data-prereq-input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        onKeyDown={onPrereqKey}
                        placeholder="e.g. CPSC 110"
                        aria-label="Prereq tree root course code"
                        className="bg-surface-container text-on-surface placeholder:text-muted focus-visible:ring-primary/40 min-h-[36px] flex-1 rounded-md px-2 py-1 text-sm outline-none focus-visible:ring-2"
                      />
                      <button
                        type="button"
                        data-prereq-commit
                        onClick={commitPrereq}
                        disabled={!code.trim()}
                        className="bg-primary text-on-primary rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-45"
                      >
                        Open
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
