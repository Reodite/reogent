/** Selection-key encode/decode and Selection-Key Map operations for the
 *  Prerequisite Tree (REQ-8). The Selection Key is `${ownerCode}::${path}`,
 *  computed server-side per disjunction (design.md §C:9) so the client never
 *  re-derives it. Selection state mirrors via these keys in
 *  `activeChannel.state.selections`; soft-toggle state mirrors in
 *  `activeChannel.state.softToggles[path]` keyed by the same path convention
 *  (root = `''`). */

export type SelectionKeyMap = Record<string, number>;

/** Encode a Selection Key: `${ownerCode}::${path}`. */
export function encodeSelectionKey(ownerCode: string, path: string): string {
  return `${ownerCode}::${path}`;
}

/** Decode a Selection Key into its owner course code and dotted path. */
export function decodeSelectionKey(key: string): { ownerCode: string; path: string } {
  const sep = key.indexOf("::");
  if (sep < 0) return { ownerCode: key, path: "" };
  return { ownerCode: key.slice(0, sep), path: key.slice(sep + 2) };
}

/** Default index 0 for disjunctions absent from the map (Property 17, REQ-8.2). */
export function getSelection(map: SelectionKeyMap, key: string): number {
  return map[key] ?? 0;
}

/** Toggle a disjunction's selection. Differs from `map` only at `${ownerCode}::${path}` (Property 15, REQ-8.3). */
export function toggleSelection(map: SelectionKeyMap, ownerCode: string, path: string, index: number): SelectionKeyMap {
  return { ...map, [encodeSelectionKey(ownerCode, path)]: index };
}

/** Selections survive a root switch unchanged (Property 16, REQ-8.4). Returns a
 *  shallow copy so callers can mutate the result without aliasing the prior map. */
export function rootSwitchSelection(map: SelectionKeyMap): SelectionKeyMap {
  return { ...map };
}
