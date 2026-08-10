import { haversineMetersObj, type LngLat } from "@/src/shared/types";
import { describe, expect, it } from "vitest";
import { buildGraph, nearestEntrancePair, routeOnGraph, shortestPath } from "./routing";

// A small L-shaped network near UBC: A --- B --- C, plus a disconnected segment.
//   A (-123.2500, 49.2600) — B (-123.2500, 49.2650) — C (-123.2450, 49.2650)
const line = (coords: LngLat[]) => ({ type: "Feature", geometry: { type: "LineString", coordinates: coords } });
const A: LngLat = [-123.25, 49.26];
const B: LngLat = [-123.25, 49.265];
const C: LngLat = [-123.245, 49.265];
const ISLAND: LngLat[] = [
  [-123.2, 49.2],
  [-123.201, 49.2],
];

const features = [line([A, B]), line([B, C]), line(ISLAND)];

describe("routing graph", () => {
  it("shares nodes between segments that meet at the same coordinate", () => {
    const graph = buildGraph(features);
    expect(graph.coords).toHaveLength(5); // A, B, C + 2 island nodes; B not duplicated
  });

  it("routes along the network, not the diagonal", () => {
    const graph = buildGraph(features);
    const from = { lat: A[1], lon: A[0] };
    const to = { lat: C[1], lon: C[0] };
    const result = routeOnGraph(graph, from, to);
    expect(result.method).toBe("network");
    // network distance = A->B + B->C legs, strictly longer than the diagonal
    const legs =
      haversineMetersObj({ lat: A[1], lon: A[0] }, { lat: B[1], lon: B[0] }) +
      haversineMetersObj({ lat: B[1], lon: B[0] }, { lat: C[1], lon: C[0] });
    expect(result.meters).toBe(Math.round(legs));
    expect(result.meters).toBeGreaterThan(haversineMetersObj(from, to));
    // polyline runs building -> snapped path -> building
    expect(result.polyline[0]).toEqual([from.lon, from.lat]);
    expect(result.polyline.at(-1)).toEqual([to.lon, to.lat]);
    expect(result.polyline).toContainEqual(B);
    expect(result.minutes).toBe(Math.ceil(result.meters / 80));
  });

  it("adds the snap gap when a building sits off the network", () => {
    const graph = buildGraph(features);
    const off = { lat: 49.26, lon: -123.2508 }; // ~60m west of A
    const result = routeOnGraph(graph, off, { lat: B[1], lon: B[0] });
    const gap = haversineMetersObj(off, { lat: A[1], lon: A[0] });
    const leg = haversineMetersObj({ lat: A[1], lon: A[0] }, { lat: B[1], lon: B[0] });
    expect(result.meters).toBe(Math.round(gap + leg));
  });

  it("falls back to a straight-line estimate across disconnected components", () => {
    const graph = buildGraph(features);
    const from = { lat: A[1], lon: A[0] };
    const island = { lat: ISLAND[0][1], lon: ISLAND[0][0] };
    const result = routeOnGraph(graph, from, island);
    expect(result.method).toBe("estimate");
    expect(result.meters).toBe(Math.round(haversineMetersObj(from, island) * 1.3));
    expect(result.polyline).toHaveLength(2);
  });

  it("shortestPath returns null between components", () => {
    const graph = buildGraph(features);
    expect(shortestPath(graph, 0, 3)).toBeNull();
  });

  it("routes on an empty graph fall back to estimate", () => {
    const result = routeOnGraph(buildGraph([]), { lat: 49.26, lon: -123.25 }, { lat: 49.265, lon: -123.245 });
    expect(result.method).toBe("estimate");
  });
});

describe("nearestEntrancePair", () => {
  it("picks the closest doors between two buildings", () => {
    // Building 1 doors on its west and east sides; building 2 sits to the east.
    const west: LngLat = [-123.251, 49.26];
    const east: LngLat = [-123.25, 49.26];
    const far: LngLat = [-123.24, 49.26];
    const near: LngLat = [-123.249, 49.26];
    expect(nearestEntrancePair([west, east], [far, near])).toEqual([east, near]);
  });

  it("returns null when either side has no entrances", () => {
    expect(nearestEntrancePair([], [[-123.25, 49.26]])).toBeNull();
    expect(nearestEntrancePair([[-123.25, 49.26]], [])).toBeNull();
  });
});
