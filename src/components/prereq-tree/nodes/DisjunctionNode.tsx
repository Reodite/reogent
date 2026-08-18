"use client";

import { useEffect, useRef, useState } from "react";
import { Handle, Position, useStore, type NodeProps } from "reactflow";

/** One branch in a disjunction (an `Or` AST node child). */
export interface DisjunctionOption {
  /** Child node id — used for dropdown-absorption edge routing (REQ-8.5). */
  childId: string;
  /** Displayed label — `displayExpr` of the branch AST (or the course code). */
  label: string;
}

/** Shared payload for both disjunction variants. Both write
 *  `selections[selectionKey] = index` into pane state (REQ-8.3); default
 *  index 0 when the path is absent (Property 17). */
export interface DisjunctionNodeData {
  id: string;
  selectionKey: string;
  options: DisjunctionOption[];
  selected?: number;
  onSelect: (selectionKey: string, index: number) => void;
}

// Handles carry no visual weight; ReactFlow still needs them so edges can
// attach to either side of the left-to-right tree.
const HIDDEN_HANDLE = {
  opacity: 0,
  width: 8,
  height: 8,
  border: "none",
  background: "transparent",
  pointerEvents: "none",
} as const;

/** `Or` node rendered "one of A, B, C" (REQ-9.1). Custom dropdown — not
 *  `<select>` — so the open menu lives inside the node's transformed
 *  container and inherits the canvas zoom (native popups escape the
 *  transform). */
export function DropdownDisjunctionNode({ data }: NodeProps<DisjunctionNodeData>) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = data.selected ?? 0;
  const current = data.options[selected]?.label ?? "—";

  // Canvas zoom closes the open menu (REQ-9.1): ReactFlow nodes scale with the
  // viewport, so a menu opened at one zoom drifts out of alignment after a
  // zoom gesture. Close on change rather than fight the transform.
  const zoom = useStore((s) => s.transform[2]);
  const lastZoom = useRef(zoom);
  useEffect(() => {
    if (lastZoom.current !== zoom) {
      if (open) setOpen(false);
      lastZoom.current = zoom;
    }
  }, [zoom, open]);

  // Outside-pointerdown + Escape dismiss (REQ-20.6). Capture-phase
  // pointerdown so ReactFlow's pan handler can't preventDefault the
  // synthesized event first; plain keydown for Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <section
      data-node-id={data.id}
      data-variant="dropdown"
      className="neu-raised bg-tertiary-container text-on-tertiary-container relative min-w-[140px] rounded-lg px-3 py-2"
    >
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} />
      <div className="text-[0.625rem] tracking-wide uppercase opacity-70">one of</div>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((o) => !o)}
        className="neu-inset focus-visible:ring-primary/40 bg-surface text-on-surface mt-1 w-full rounded-md px-2 py-1 text-left font-mono text-sm focus-visible:ring-2 focus-visible:ring-offset-1"
      >
        {current}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="listbox"
          // `nowheel` is ReactFlow's built-in opt-out: wheel events inside
          // this element reach the menu's `overflow:auto` instead of
          // turning into canvas zoom (REQ-9.1).
          className="nowheel neu-raised bg-surface text-on-surface absolute top-full left-0 z-10 mt-1 max-h-[200px] min-w-[160px] overflow-auto rounded-lg p-1"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {data.options.map((opt, i) => (
            <button
              key={opt.childId}
              type="button"
              role="option"
              aria-selected={i === selected}
              onClick={() => {
                data.onSelect(data.selectionKey, i);
                setOpen(false);
              }}
              className={`focus-visible:ring-primary/40 block w-full rounded px-2 py-1 text-left font-mono text-sm focus-visible:ring-2 focus-visible:ring-offset-1 ${
                i === selected ? "bg-accent-subtle text-primary" : "hover:bg-surface-container-high"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} />
    </section>
  );
}

/** `Or` node rendered "Either (a) … or (b) …" (REQ-9.2). Vertical radio
 *  group: one row per branch; selected row raised + bordered; unselected
 *  rows dimmed. */
export function StackedDisjunctionNode({ data }: NodeProps<DisjunctionNodeData>) {
  const selected = data.selected ?? 0;
  return (
    <section
      data-node-id={data.id}
      data-variant="stacked"
      className="neu-raised bg-tertiary-container text-on-tertiary-container min-w-[160px] rounded-lg px-3 py-2"
    >
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} />
      <div className="text-[0.625rem] tracking-wide uppercase opacity-70">either</div>
      <div role="radiogroup" className="mt-1 flex flex-col gap-1">
        {data.options.map((opt, i) => {
          const isSelected = i === selected;
          return (
            <label
              key={opt.childId}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className={`flex items-start gap-2 rounded-md border px-2 py-1 text-left ${
                isSelected
                  ? "neu-raised border-border-subtle bg-surface text-on-surface"
                  : "border-transparent opacity-45"
              }`}
            >
              <input
                type="radio"
                name={data.selectionKey}
                checked={isSelected}
                onChange={() => data.onSelect(data.selectionKey, i)}
                className="accent-primary focus-visible:ring-primary/40 mt-0.5 size-3 shrink-0 focus-visible:ring-2 focus-visible:ring-offset-1"
              />
              <span className="font-mono text-sm leading-tight">{opt.label}</span>
            </label>
          );
        })}
      </div>
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} />
    </section>
  );
}
