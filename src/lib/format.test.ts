import {
  formatCad,
  formatMeters,
  formatMinutes,
  SESSION_GROUP_ORDER,
  sessionGroup,
  summarizeToolInput,
} from "@/src/lib/format";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("sessionGroup", () => {
  const now = new Date("2026-08-06T12:00:00Z");

  it("buckets the boundary cases", () => {
    expect(sessionGroup("2026-08-06T09:00:00Z", now)).toBe("Today");
    expect(sessionGroup("2026-08-05T23:59:00Z", now)).toBe("Yesterday");
    expect(sessionGroup("2026-08-02T12:00:00Z", now)).toBe("This week");
    // Same calendar month but beyond the 7-day window:
    const lateMonth = new Date("2026-08-28T12:00:00Z");
    expect(sessionGroup("2026-08-05T12:00:00Z", lateMonth)).toBe("This month");
    // A previous calendar month is "Older", even when recent:
    expect(sessionGroup("2026-07-14T12:00:00Z", now)).toBe("Older");
    expect(sessionGroup("not-a-date", now)).toBe("Older");
  });

  it("always returns a known group, and newer timestamps never land in older buckets (property)", () => {
    const iso = fc
      .date({ min: new Date("2020-01-01"), max: new Date("2026-08-06T11:59:59Z"), noInvalidDate: true })
      .map((d) => d.toISOString());
    fc.assert(
      fc.property(iso, iso, (a, b) => {
        const [newer, older] = Date.parse(a) >= Date.parse(b) ? [a, b] : [b, a];
        const groupNewer = sessionGroup(newer, now);
        const groupOlder = sessionGroup(older, now);
        return (
          SESSION_GROUP_ORDER.includes(groupNewer) &&
          SESSION_GROUP_ORDER.includes(groupOlder) &&
          SESSION_GROUP_ORDER.indexOf(groupNewer) <= SESSION_GROUP_ORDER.indexOf(groupOlder)
        );
      }),
    );
  });
});

describe("formatters", () => {
  it("formats CAD amounts", () => {
    expect(formatCad(202.13)).toBe("$202.13");
    expect(formatCad(1494.65)).toBe("$1,494.65");
  });

  it("returns placeholder for non-finite CAD values", () => {
    expect(formatCad(NaN)).toBe("—");
    expect(formatCad(Infinity)).toBe("—");
    expect(formatCad(-Infinity)).toBe("—");
  });

  it("formats meters, switching to km at 1000", () => {
    expect(formatMeters(460)).toBe("460 m");
    expect(formatMeters(1250)).toBe("1.3 km");
  });

  it("returns placeholder for non-finite meter values", () => {
    expect(formatMeters(NaN)).toBe("—");
    expect(formatMeters(Infinity)).toBe("—");
    expect(formatMeters(-Infinity)).toBe("—");
  });

  it("never reports less than one minute", () => {
    expect(formatMinutes(0.2)).toBe("1 min");
    expect(formatMinutes(6)).toBe("6 min");
  });

  it("returns placeholder for non-finite minute values", () => {
    expect(formatMinutes(NaN)).toBe("—");
    expect(formatMinutes(Infinity)).toBe("—");
    expect(formatMinutes(-Infinity)).toBe("—");
  });
});

describe("summarizeToolInput", () => {
  it("renders key=value pairs and skips empties", () => {
    expect(summarizeToolInput({ query: "algorithms", limit: 3, term: undefined })).toBe('query="algorithms", limit=3');
  });

  it("handles circular references without throwing", () => {
    const circular: Record<string, unknown> = { name: "test" };
    circular.self = circular;
    expect(() => summarizeToolInput(circular)).not.toThrow();
    expect(summarizeToolInput(circular)).toContain("[complex]");
  });

  it("never exceeds the length budget (property)", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fc.string({ maxLength: 40 })), (input) => {
        return summarizeToolInput(input).length <= 48;
      }),
    );
  });
});
