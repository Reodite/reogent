"use client";

import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { TextInput } from "@/src/components/ui/form-controls";
import { colorFor, initialsFor } from "@/src/lib/schedule/avatar";
import type { Avatar, Schedule } from "@/src/lib/schedule/types";
import { useEffect, useState } from "react";
import { AvatarChip } from "./avatar-chip";
import { AvatarPicker } from "./avatar-picker";
import { useDialogFocus } from "./use-dialog-focus";

interface Props {
  /** present when editing an existing record; a fresh upload passes schedule */
  schedule?: Schedule;
  currentHandle?: string;
  currentAvatar?: Avatar;
  title: string;
  saveLabel: string;
  onSave: (handle: string, avatar: Avatar) => Promise<void>;
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
  const [saving, setSaving] = useState(false);
  const dialogRef = useDialogFocus<HTMLFormElement>();

  // Until the user explicitly picks an avatar, initials track the handle.
  const liveAvatar: Avatar =
    !touched && avatar.kind === "initials" && handle.trim()
      ? { kind: "initials", initials: initialsFor(handle), color: colorFor(handle) }
      : avatar;

  const sectionCount = schedule?.sections.length ?? 0;
  const courseCount = new Set(schedule?.sections.map((section) => section.courseCode || section.title) ?? []).size;

  async function save() {
    const trimmed = handle.trim();
    if (!trimmed) {
      setError("Pick a handle.");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await onSave(trimmed, liveAvatar);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !saving && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel schedule profile"
        tabIndex={-1}
        disabled={saving}
        onClick={onCancel}
        className="bg-on-surface/20 absolute inset-0 cursor-default"
      />
      <form
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={title}
        aria-busy={saving}
        className="neu-panel relative w-full max-w-md rounded-2xl p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h2 className="text-on-surface text-base font-medium">{title}</h2>

        <div className="bg-surface-container-low mt-3 flex items-center gap-3 rounded-lg p-3">
          {handle.trim() ? (
            <AvatarChip avatar={liveAvatar} size={40} />
          ) : (
            <span className="neu-panel text-muted flex size-10 items-center justify-center rounded-full">
              <Icon name="group" size={18} />
            </span>
          )}
          <div>
            <div className="text-on-surface font-medium">{handle.trim() || "Your schedule"}</div>
            {sectionCount > 0 && (
              <div className="text-on-surface-variant text-xs">
                {courseCount} courses · {sectionCount} sections
              </div>
            )}
          </div>
        </div>

        <label htmlFor="schedule-profile-handle" className="mt-4 flex flex-col gap-1">
          <span className="text-muted text-xs font-medium">Handle</span>
          <TextInput
            id="schedule-profile-handle"
            type="text"
            data-dialog-initial-focus
            value={handle}
            disabled={saving}
            maxLength={24}
            placeholder="e.g. max"
            onChange={(event) => {
              setHandle(event.target.value);
              setError("");
            }}
          />
        </label>

        {error && <p className="text-error mt-2 text-sm">{error}</p>}

        <div className="mt-4">
          <AvatarPicker
            handle={handle}
            avatar={liveAvatar}
            onChange={(nextAvatar) => {
              setAvatar(nextAvatar);
              setTouched(true);
            }}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button size="prominent" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="prominent" disabled={saving}>
            {saving ? "Saving…" : saveLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
