"use client";

import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { DialogActions, DialogHeader, DialogPanel, DialogRoot } from "@/src/components/ui/dialog";
import { Field, TextInput } from "@/src/components/ui/form-controls";
import { colorFor, initialsFor } from "@/src/lib/schedule/avatar";
import type { Avatar, Schedule } from "@/src/lib/schedule/types";
import { useState } from "react";
import { AvatarChip } from "./avatar-chip";
import { AvatarPicker } from "./avatar-picker";

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

  return (
    <DialogRoot onDismiss={onCancel} dismissDisabled={saving} backdropLabel="Cancel schedule profile">
      <DialogPanel
        as="form"
        aria-label={title}
        aria-busy={saving}
        size="md"
        padding="none"
        className="flex flex-col overflow-hidden"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <DialogHeader title={title} className="p-4 pb-0 sm:p-6 sm:pb-0" />

        <div data-dialog-scroll className="min-h-0 space-y-4 overflow-y-auto p-4 sm:px-6">
          <div className="bg-surface-container-low flex items-center gap-3 rounded-lg p-3">
            {handle.trim() ? (
              <AvatarChip avatar={liveAvatar} size={40} />
            ) : (
              <span className="neu-panel text-muted flex size-10 items-center justify-center rounded-full">
                <Icon name="group" size={18} />
              </span>
            )}
            <div className="space-y-1">
              <div className="text-on-surface font-medium">{handle.trim() || "Your schedule"}</div>
              {sectionCount > 0 && (
                <div className="text-on-surface-variant text-xs">
                  {courseCount} courses · {sectionCount} sections
                </div>
              )}
            </div>
          </div>

          <Field label="Handle" htmlFor="schedule-profile-handle" error={error}>
            <TextInput
              id="schedule-profile-handle"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "schedule-profile-handle-error" : undefined}
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
          </Field>

          <AvatarPicker
            handle={handle}
            avatar={liveAvatar}
            onChange={(nextAvatar) => {
              setAvatar(nextAvatar);
              setTouched(true);
            }}
          />
        </div>

        <footer className="shrink-0 px-4 pb-4 sm:px-6 sm:pb-6">
          <DialogActions spacing="none">
            <Button size="prominent" disabled={saving} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="prominent" disabled={saving}>
              {saving ? "Saving…" : saveLabel}
            </Button>
          </DialogActions>
        </footer>
      </DialogPanel>
    </DialogRoot>
  );
}
