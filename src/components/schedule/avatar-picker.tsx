"use client";

import { AVATAR_COLORS, AVATAR_EMOJI, downscaleImage, initialsFor } from "@/src/lib/schedule/avatar";
import type { Avatar } from "@/src/lib/schedule/types";
import { useRef, useState } from "react";
import { useToast } from "./toast";

interface Props {
  handle: string;
  avatar: Avatar;
  onChange: (avatar: Avatar) => void;
}

type Tab = "emoji" | "initials" | "photo";

/** Emoji / initials / photo trio plus an accent color row. */
export function AvatarPicker({ handle, avatar, onChange }: Props) {
  const [tab, setTab] = useState<Tab>(avatar.kind === "image" ? "photo" : avatar.kind);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-muted text-xs font-medium">Avatar</legend>
      <div className="flex gap-1.5">
        {(["emoji", "initials", "photo"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              if (t === "initials") {
                onChange({ kind: "initials", initials: initialsFor(handle || "??"), color: avatar.color });
              }
            }}
            className={`neu-button min-h-9 flex-1 rounded-lg px-3 text-xs font-medium text-on-surface${tab === t ? "bg-surface-container-low" : ""}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "emoji" && (
        <div className="neu-inset bg-surface-container-low grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-xl p-2">
          {AVATAR_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={avatar.kind === "emoji" && avatar.emoji === e}
              onClick={() => onChange({ kind: "emoji", emoji: e, color: avatar.color })}
              className={`flex aspect-square items-center justify-center rounded-lg text-lg ${avatar.kind === "emoji" && avatar.emoji === e ? "bg-surface ring-primary/40 shadow-sm ring-2" : "hover:bg-surface"}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {tab === "photo" && (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="neu-button bg-surface text-on-surface min-h-10 rounded-xl px-4 text-sm font-medium"
          >
            {avatar.imageDataUrl ? "Replace photo" : "Upload photo"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const imageDataUrl = await downscaleImage(file);
                onChange({ kind: "image", imageDataUrl, initials: initialsFor(handle || "??"), color: avatar.color });
              } catch {
                toast("Could not read that image.", "error");
              }
            }}
          />
        </>
      )}

      <div className="flex flex-wrap gap-1.5">
        {AVATAR_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`color ${c}`}
            aria-pressed={avatar.color === c}
            onClick={() => onChange({ ...avatar, color: c })}
            className={`size-6 rounded-full ${avatar.color === c ? "ring-on-surface/60 ring-offset-surface ring-2 ring-offset-2" : ""}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </fieldset>
  );
}
