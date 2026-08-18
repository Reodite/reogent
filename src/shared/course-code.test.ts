import { describe, expect, it } from "vitest";
import { canonicalize, extractCourseCodes, isOkanagan } from "./course-code";

describe("canonicalize", () => {
  it("strips _V and canonicalizes a Vancouver code", () => {
    expect(canonicalize("AANB_V 500")).toEqual({
      kind: "code",
      subject: "AANB",
      number: "500",
      raw: "AANB 500",
    });
    expect(canonicalize("cpsc 110")).toEqual({
      kind: "code",
      subject: "CPSC",
      number: "110",
      raw: "CPSC 110",
    });
    expect(canonicalize("STAT 447B")).toEqual({
      kind: "code",
      subject: "STAT",
      number: "447B",
      raw: "STAT 447B",
    });
  });

  it("rejects Okanagan (_O) codes", () => {
    const r = canonicalize("CPSC_O 110");
    expect(r).toEqual({ kind: "rejected", reason: "okanagan", raw: "CPSC_O 110" });
  });

  it("classifies a bare subject as a subject prefix", () => {
    expect(canonicalize("cpsc")).toEqual({ kind: "subject", subject: "CPSC", raw: "CPSC" });
    expect(canonicalize("PHARM")).toEqual({ kind: "subject", subject: "PHARM", raw: "PHARM" });
  });

  it("returns null for unrelated text", () => {
    expect(canonicalize("hello world")).toBeNull();
    expect(canonicalize("")).toBeNull();
    expect(canonicalize("30 credits")).toBeNull();
  });

  it("is idempotent through the raw field", () => {
    const cases = ["AANB_V 500", "cpsc 110", "CPSC_O 110", "cpsc", "hello", "STAT 447B"];
    for (const s of cases) {
      const first = canonicalize(s);
      const second = canonicalize(first?.raw ?? s);
      expect(second).toEqual(first);
    }
  });
});

describe("isOkanagan", () => {
  it("detects the _O campus suffix", () => {
    expect(isOkanagan("CPSC_O 110")).toBe(true);
    expect(isOkanagan("CPSC 110")).toBe(false);
    expect(isOkanagan("CPSC_V 110")).toBe(false);
  });
});

describe("extractCourseCodes", () => {
  it("pulls canonical codes out of free-form text, deduped, _V stripped, _O skipped", () => {
    expect(extractCourseCodes("Take CPSC_V 110 and cpsc 210 before CPSC_O 999")).toEqual(["CPSC 110", "CPSC 210"]);
    expect(extractCourseCodes("no codes here")).toEqual([]);
    expect(extractCourseCodes("")).toEqual([]);
  });
});
