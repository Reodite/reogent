import type { MeetingPattern, Section } from "../types";
import { fnv1a } from "../util/hash";

function meetingSignature(m: MeetingPattern): string {
  return [m.days.join(""), m.startMin, m.endMin, m.buildingCode ?? "", m.room ?? ""].join(",");
}

/**
 * Deterministic identity for a section across different people's uploads.
 * Two friends registered in the same class produce the same id, which is
 * what lets the calendar render one block with both their avatars.
 * Dates are excluded because title + component + weekly slot + room form the
 * stable identity after per-meeting ranges collapse into one term range.
 */
export function computeSectionId(s: Omit<Section, "id">): string {
  const sig = [s.courseCode, s.title, s.component, ...s.meetings.map(meetingSignature).sort()].join("|");
  return fnv1a(sig);
}
