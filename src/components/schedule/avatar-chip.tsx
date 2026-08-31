"use client";

import type { Avatar } from "@/src/lib/schedule/types";

interface Props {
  avatar: Avatar;
  size?: number;
  title?: string;
}

/** Identity chip for a person: photo, emoji, or initials on their accent color. */
export function AvatarChip({ avatar, size = 26, title }: Props) {
  const style = {
    width: size,
    height: size,
    fontSize: size * 0.42,
    borderColor: avatar.color,
  } as React.CSSProperties;
  const base =
    "neu-panel inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 font-semibold text-on-surface select-none";
  if (avatar.kind === "image" && avatar.imageDataUrl) {
    return (
      <span className={base} style={style} title={title}>
        {/* biome-ignore lint/performance/noImgElement: data-URL avatar photo */}
        <img src={avatar.imageDataUrl} alt={title ?? ""} className="size-full object-cover" />
      </span>
    );
  }
  if (avatar.kind === "emoji") {
    return (
      <span className={base} style={{ ...style, fontSize: size * 0.55 }} title={title}>
        {avatar.emoji}
      </span>
    );
  }
  return (
    <span className={base} style={style} title={title}>
      {avatar.initials}
    </span>
  );
}
