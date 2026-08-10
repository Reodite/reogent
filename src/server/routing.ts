import { ESTIMATE_DETOUR, haversineMetersObj, WALK_SPEED_M_PER_MIN, type LngLat } from "@/src/shared/types";
import { dataStore } from "./data";

/** Shortest walking routes over the campus pedestrian network
 *  (walking-routes.geojson, derived at ingest from ubcv_routes.geojson). */

export { WALK_SPEED_M_PER_MIN };
export type { LngLat };

export interface RouteResult {
  meters: number;
  minutes: number;
  /** "network" = shortest path over walking paths; "estimate" = straight-line fallback */
  method: "network" | "estimate";
  polyline: LngLat[]; // GeoJSON coordinate order, building to building
}

export interface Graph {
  coords: LngLat[]; // node id -> coordinate
  adj: { to: number; w: number }[][]; // node id -> edges
  grid: SpatialGrid;
}

/** Grid-based spatial index for O(1) nearest-node lookups over small areas. */
interface SpatialGrid {
  cells: Map<string, number[]>;
  cellSize: number; // degrees per cell
}

const CELL_SIZE = 0.002; // ~220m per cell at 49N latitude

function gridKey(lon: number, lat: number): string {
  return `${Math.floor(lon / CELL_SIZE)},${Math.floor(lat / CELL_SIZE)}`;
}

function buildSpatialGrid(coords: LngLat[]): SpatialGrid {
  const cells = new Map<string, number[]>();
  for (let i = 0; i < coords.length; i++) {
    const k = gridKey(coords[i][0], coords[i][1]);
    const bucket = cells.get(k);
    if (bucket) bucket.push(i);
    else cells.set(k, [i]);
  }
  return { cells, cellSize: CELL_SIZE };
}

// biome-ignore lint/suspicious/noExplicitAny: raw GeoJSON features
type Feature = Record<string, any>;

const key = (c: LngLat) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
const toPoint = (c: LngLat) => ({ lon: c[0], lat: c[1] });

/** Nodes are shared line endpoints/vertices; edges are consecutive vertices. */
export function buildGraph(features: Feature[]): Graph {
  const ids = new Map<string, number>();
  const coords: LngLat[] = [];
  const adj: { to: number; w: number }[][] = [];
  const nodeOf = (c: LngLat): number => {
    const k = key(c);
    let id = ids.get(k);
    if (id === undefined) {
      id = coords.length;
      ids.set(k, id);
      coords.push(c);
      adj.push([]);
    }
    return id;
  };
  for (const f of features) {
    const g = f?.geometry;
    if (!g) continue;
    const lines: LngLat[][] =
      g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const a = nodeOf(line[i - 1]);
        const b = nodeOf(line[i]);
        const w = haversineMetersObj(toPoint(line[i - 1]), toPoint(line[i]));
        adj[a].push({ to: b, w });
        adj[b].push({ to: a, w });
      }
    }
  }
  return { coords, adj, grid: buildSpatialGrid(coords) };
}

/** Finds the closest graph node using the spatial grid. Checks a 3x3 cell
 *  neighborhood first; expands the search radius if no node is found nearby. */
export function nearestNode(graph: Graph, p: { lat: number; lon: number }): number {
  const { grid, coords } = graph;
  const cx = Math.floor(p.lon / grid.cellSize);
  const cy = Math.floor(p.lat / grid.cellSize);

  let best = -1;
  let bestDist = Infinity;

  const scan = (radius: number) => {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const bucket = grid.cells.get(`${cx + dx},${cy + dy}`);
        if (!bucket) continue;
        for (const i of bucket) {
          const d = haversineMetersObj(p, toPoint(coords[i]));
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        }
      }
    }
  };

  // Start with the immediate neighborhood (3x3 = ~660m radius at 49N)
  scan(1);
  if (best !== -1) return best;
  // Expand if the graph is sparse in this area
  scan(3);
  if (best !== -1) return best;
  // Full fallback (should never happen on a connected campus graph)
  for (let i = 0; i < coords.length; i++) {
    const d = haversineMetersObj(p, toPoint(coords[i]));
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Dijkstra with a binary heap; returns node path or null if unreachable. */
export function shortestPath(graph: Graph, from: number, to: number): number[] | null {
  const dist = new Array<number>(graph.coords.length).fill(Infinity);
  const prev = new Array<number>(graph.coords.length).fill(-1);
  dist[from] = 0;
  // heap of [dist, node]
  const heap: [number, number][] = [[0, from]];
  const push = (e: [number, number]) => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): [number, number] | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0 && last) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (;;) {
    const top = pop();
    if (!top) return null;
    const [d, u] = top;
    if (u === to) break;
    if (d > dist[u]) continue; // stale entry
    for (const { to: v, w } of graph.adj[u]) {
      const nd = d + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        push([nd, v]);
      }
    }
  }
  const path = [to];
  while (path[0] !== from) {
    const p = prev[path[0]];
    if (p === -1) return null;
    path.unshift(p);
  }
  return path;
}

/** Pure routing over a prebuilt graph; falls back to a straight-line estimate
 *  when either endpoint snaps into a disconnected part of the network. */
export function routeOnGraph(
  graph: Graph,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): RouteResult {
  const estimate = (): RouteResult => {
    const meters = Math.round(haversineMetersObj(from, to) * ESTIMATE_DETOUR);
    return {
      meters,
      minutes: Math.ceil(meters / WALK_SPEED_M_PER_MIN),
      method: "estimate",
      polyline: [
        [from.lon, from.lat],
        [to.lon, to.lat],
      ],
    };
  };
  if (graph.coords.length === 0) return estimate();
  const a = nearestNode(graph, from);
  const b = nearestNode(graph, to);
  const path = shortestPath(graph, a, b);
  if (!path) return estimate();
  let meters = haversineMetersObj(from, toPoint(graph.coords[a])) + haversineMetersObj(to, toPoint(graph.coords[b]));
  for (let i = 1; i < path.length; i++) {
    meters += haversineMetersObj(toPoint(graph.coords[path[i - 1]]), toPoint(graph.coords[path[i]]));
  }
  meters = Math.round(meters);
  return {
    meters,
    minutes: Math.ceil(meters / WALK_SPEED_M_PER_MIN),
    method: "network",
    polyline: [[from.lon, from.lat], ...path.map((n) => graph.coords[n]), [to.lon, to.lat]],
  };
}

/** Closest pair between two entrance sets by straight-line distance — the
 *  doors a person would actually walk between. Null when either side is empty. */
// ponytail: straight-line pair pick, ~n*m haversines; if a courtyard wall ever misroutes, switch to multi-source Dijkstra over all door pairs
export function nearestEntrancePair(fromEntrances: LngLat[], toEntrances: LngLat[]): [LngLat, LngLat] | null {
  let best: [LngLat, LngLat] | null = null;
  let bestDist = Infinity;
  for (const a of fromEntrances) {
    for (const b of toEntrances) {
      const d = haversineMetersObj(toPoint(a), toPoint(b));
      if (d < bestDist) {
        bestDist = d;
        best = [a, b];
      }
    }
  }
  return best;
}

let graphPromise: Promise<Graph> | undefined;
let graphLoadedAt = 0;

/** Cache TTL in milliseconds. Reloads the graph after this period. */
const GRAPH_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Preload the graph from raw features (local dev/tests without the data store). */
export function primeGraph(features: Feature[]): void {
  graphPromise = Promise.resolve(buildGraph(features));
  graphLoadedAt = Date.now();
}

/** Lazy-loaded graph from the derived walking-routes artifact in the data store.
 *  Reloads after GRAPH_TTL_MS to pick up re-ingested data. */
export function getGraph(): Promise<Graph> {
  if (graphPromise && Date.now() - graphLoadedAt > GRAPH_TTL_MS) {
    graphPromise = undefined;
  }
  graphPromise ??= dataStore()
    .getJson("derived/walking-routes.geojson")
    .then((geo) => {
      graphLoadedAt = Date.now();
      return buildGraph((geo as { features: Feature[] }).features);
    })
    .catch((e) => {
      graphPromise = undefined;
      throw e;
    });
  return graphPromise;
}

let entrancesPromise: Promise<Record<string, LngLat[]>> | undefined;
let entrancesLoadedAt = 0;

/** Lazy-loaded building-entrance map (derived/building-entrances.json).
 *  Resolves to {} when the artifact is missing (pre-ingest) so routing
 *  falls back to centroids. */
export function getEntrances(): Promise<Record<string, LngLat[]>> {
  if (entrancesPromise && Date.now() - entrancesLoadedAt > GRAPH_TTL_MS) {
    entrancesPromise = undefined;
  }
  entrancesPromise ??= dataStore()
    .getJson("derived/building-entrances.json")
    .then((data) => {
      entrancesLoadedAt = Date.now();
      return data as Record<string, LngLat[]>;
    })
    .catch(() => {
      entrancesPromise = undefined;
      return {};
    });
  return entrancesPromise;
}

/** Door-to-door route: endpoints snap to the closest entrance pair between the
 *  two buildings when entrance data exists for the code; centroid otherwise. */
export async function route(
  from: { lat: number; lon: number; code?: string },
  to: { lat: number; lon: number; code?: string },
): Promise<RouteResult> {
  const [graph, entrances] = await Promise.all([getGraph(), getEntrances()]);
  const fromDoors = (from.code && entrances[from.code]) || [[from.lon, from.lat] as LngLat];
  const toDoors = (to.code && entrances[to.code]) || [[to.lon, to.lat] as LngLat];
  const pair = nearestEntrancePair(fromDoors, toDoors);
  if (!pair) return routeOnGraph(graph, from, to);
  return routeOnGraph(graph, toPoint(pair[0]), toPoint(pair[1]));
}
