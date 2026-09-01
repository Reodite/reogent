export type DayCode = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export const DAY_ORDER: DayCode[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface MeetingPattern {
  days: DayCode[];
  /** minutes since midnight, local wall-clock (570 = 9:30) */
  startMin: number;
  endMin: number;
  campus?: string; // 'UBCV'
  buildingName?: string; // 'Buchanan Building'
  buildingCode?: string; // 'BUCH'
  floor?: string; // keep as string to preserve '-2'
  room?: string; // 'D322'
  /** original pattern line, for tooltips/debugging */
  raw: string;
}

export interface Section {
  /** hash of section identity — the cross-person merge key */
  id: string;
  courseCode: string; // 'CPSC_V 221' (specific section suffixes like '-L2A' are dropped)
  title: string; // 'Basic Algorithms and Data Structures'
  component: string; // 'Lecture' | 'Laboratory' | 'Discussion' | 'Seminar' | ...
  instructors: string[];
  /**
   * ISO date bounds of the section (outer range across its meeting patterns).
   * The only date info we keep — drives term bucketing; per-meeting ranges
   * (reading-break splits) collapse because the week view only needs the outer term range.
   */
  termStart?: string;
  termEnd?: string;
  meetings: MeetingPattern[];
}

export interface Schedule {
  sections: Section[];
  sourceFileName?: string;
  importedAt: string;
}

export type AvatarKind = "emoji" | "initials" | "image";

export interface Avatar {
  kind: AvatarKind;
  emoji?: string;
  initials?: string;
  /** hex accent color, always present (chip border / initials background) */
  color: string;
  /** 96px JPEG data URL stored with the person's DB record */
  imageDataUrl?: string;
}

export interface Person {
  /** stable identity that survives handle renames (the owning user's id) */
  id: string;
  handle: string;
  avatar: Avatar;
  schedule: Schedule | null;
  /** ISO timestamp; newest-wins on update */
  updatedAt: string;
  /** per-view show/hide flag for the calendar */
  enabled: boolean;
}
