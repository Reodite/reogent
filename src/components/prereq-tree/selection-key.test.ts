import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  decodeSelectionKey,
  encodeSelectionKey,
  getSelection,
  rootSwitchSelection,
  toggleSelection,
  type SelectionKeyMap,
} from "./selection-key";

describe("selection-key encode/decode", () => {
  it("round-trips an owner code + path", () => {
    const cases = [
      { ownerCode: "CPSC 320", path: "" },
      { ownerCode: "CPSC 320", path: "0" },
      { ownerCode: "MATH 200", path: "0.1.2" },
    ];
    for (const { ownerCode, path } of cases) {
      const { ownerCode: o, path: p } = decodeSelectionKey(encodeSelectionKey(ownerCode, path));
      expect(o).toBe(ownerCode);
      expect(p).toBe(path);
    }
  });

  it("decodes a key without a separator as the owner code with empty path", () => {
    expect(decodeSelectionKey("CPSC 320")).toEqual({ ownerCode: "CPSC 320", path: "" });
  });
});

const arbOwner = fc
  .tuple(
    fc.string({ minLength: 2, maxLength: 4 }).filter((s) => /^[A-Za-z]+$/.test(s)),
    fc.integer({ min: 100, max: 999 }),
  )
  .map(([s, n]) => `${s.toUpperCase()} ${n}`);
const arbPath = fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 4 }).map((a) => a.join("."));
const arbKey = fc.tuple(arbOwner, arbPath).map(([o, p]) => encodeSelectionKey(o, p));
const arbMap = fc.dictionary(arbKey, fc.integer({ min: 0, max: 5 }));

describe("selection-key properties (Domain 5)", () => {
  it("Property 15: toggling path p modifies only the `${owner}::${p}` key (REQ-8.3)", () => {
    fc.assert(
      fc.property(arbMap, arbOwner, arbPath, fc.integer({ min: 0, max: 5 }), (map, ownerCode, path, index) => {
        const key = encodeSelectionKey(ownerCode, path);
        const next = toggleSelection(map, ownerCode, path, index);
        expect(next[key]).toBe(index);
        for (const [k, v] of Object.entries(map)) if (k !== key) expect(next[k]).toBe(v);
      }),
    );
  });

  it("Property 16: every Selection Key Map entry survives a root switch with the same value (REQ-8.4)", () => {
    fc.assert(
      fc.property(arbMap, (map) => {
        const next = rootSwitchSelection(map);
        for (const [k, v] of Object.entries(map)) expect(next[k]).toBe(v);
      }),
    );
  });

  it("Property 17: disjunctions absent from the map default to child index 0 (REQ-8.2)", () => {
    fc.assert(
      fc.property(arbMap, arbKey, (map, key) => {
        expect(getSelection(map, key)).toBe(map[key] ?? 0);
      }),
    );
  });
});
