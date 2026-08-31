"use client";

import { colorFor, initialsFor } from "@/src/lib/schedule/avatar";
import type { Avatar, Schedule } from "@/src/lib/schedule/types";
import { useEffect, useState } from "react";
import { AvatarChip } from "./avatar-chip";
import { AvatarPicker } from "./avatar-picker";

interface Props {
  /** present when editing an existing record; a fresh upload passes schedule */
  schedule?: Schedule;
  currentHandle?: string;
  currentAvatar?: Avatar;
  title: string;
  saveLabel: string;
  onSave: (handle: string, avatar: Avatar) => void;
  onCancel: () => void;
}

/** Handle + avatar form shown after parsing a schedule (or when editing yours). */
export function ProfileModal({ schedule, currentHandle, currentAvatar, title, saveLabel, onSave, onCancel }: Props) {
  const editing = !!currentHandle;
  const [handle, setHandle] = useState(currentHandle ?? "");
  const [avatar, setAvatar] = useState<Avatar>(
    currentAvatar ?? { kind: "initials", initials: "??", color: colorFor("new") },
  );
  const [touched, setTouched] = useState(editing);
  const [error, setError] = useState("");

  // Until the user explicitly picks an avatar, initials track the handle.
  const liveAvatar: Avatar =
    !touched && avatar.kind === "initials" && handle.trim()
      ? { kind: "initials", initials: initialsFor(handle), color: colorFor(handle) }
      : avatar;

  const sectionCount = schedule?.sections.length ?? 0;
  const courseCount = new Set(schedule?.sections.map((s) => s.courseCode || s.title) ?? []).size;

  function save() {
    const trimmed = handle.trim();
    if (!trimmed) {
      setError("Pick a handle.");
      return;
    }
    onSave(trimmed, liveAvatar);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel schedule profile"
        onClick={onCancel}
        className="bg-on-surface/20 absolute inset-0 cursor-default backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="neu-panel relative w-full max-w-md rounded-2xl p-5"
      >
        <h2 className="text-on-surface text-base font-semibold">{title}</h2>

        <div className="bg-surface-container-low mt-3 flex items-center gap-3 rounded-xl p-3">
          <AvatarChip avatar={liveAvatar} size={40} />
          <div>
            <div className="text-on-surface font-semibold">{handle.trim() || "—"}</div>
            {sectionCount > 0 && (
              <div className="text-on-surface-variant text-xs">
                {courseCount} courses · {sectionCount} sections
              </div>
            )}
          </div>
        </div>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-muted text-xs font-medium">Handle</span>
          <input
            type="text"
            value={handle}
            maxLength={24}
            placeholder="e.g. max"
            className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 min-h-11 rounded-xl px-3 text-sm outline-none focus-visible:ring-2"
            onChange={(e) => {
              setHandle(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </label>

        {error && <p className="text-error mt-2 text-sm">{error}</p>}

        <div className="mt-4">
          <AvatarPicker
            handle={handle}
            avatar={liveAvatar}
            onChange={(a) => {
              setAvatar(a);
              setTouched(true);
            }}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="neu-button text-on-surface-variant min-h-10 rounded-xl px-4 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="neu-button bg-primary text-on-primary min-h-10 rounded-xl px-4 text-sm font-medium"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
