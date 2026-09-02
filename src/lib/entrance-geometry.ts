import type { EntranceFeatureCollection, EntranceMarker } from "@/src/lib/api-types";
import { pointInFeature, type BuildingFeature, type LngLat } from "@/src/lib/geo";
import type { FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

const METERS_PER_LATITUDE_DEGREE = 110_540;
const DEFAULT_MAX_WALL_DISTANCE_METERS = 4;

type Vec2 = [number, number];

interface WallProjection {
  point: Vec2;
  tangent: Vec2;
  distance: number;
}

function finiteLngLat(position: Position): position is LngLat {
  return (
    position.length >= 2 &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    position[0] >= -180 &&
    position[0] <= 180 &&
    position[1] >= -90 &&
    position[1] <= 90
  );
}

function metersPerLongitudeDegree(latitude: number): number {
  return 111_320 * Math.cos((latitude * Math.PI) / 180);
}

function toMeters(position: Position, origin: LngLat): Vec2 {
  return [
    (position[0] - origin[0]) * metersPerLongitudeDegree(origin[1]),
    (position[1] - origin[1]) * METERS_PER_LATITUDE_DEGREE,
  ];
}

function toLngLat(position: Vec2, origin: LngLat): LngLat {
  return [
    origin[0] + position[0] / metersPerLongitudeDegree(origin[1]),
    origin[1] + position[1] / METERS_PER_LATITUDE_DEGREE,
  ];
}

function add(a: Vec2, b: Vec2, scale = 1): Vec2 {
  return [a[0] + b[0] * scale, a[1] + b[1] * scale];
}

function ringsOf(geometry: Polygon | MultiPolygon): Position[][] {
  return geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
}

function nearestWall(feature: BuildingFeature, entrance: LngLat): WallProjection | null {
  let nearest: WallProjection | null = null;
  for (const ring of ringsOf(feature.geometry)) {
    for (let index = 0; index < ring.length - 1; index++) {
      const from = ring[index];
      const to = ring[index + 1];
      if (!finiteLngLat(from) || !finiteLngLat(to)) continue;
      const a = toMeters(from, entrance);
      const b = toMeters(to, entrance);
      const delta: Vec2 = [b[0] - a[0], b[1] - a[1]];
      const lengthSquared = delta[0] ** 2 + delta[1] ** 2;
      if (lengthSquared <= 0) continue;
      const progress = Math.max(0, Math.min(1, -(a[0] * delta[0] + a[1] * delta[1]) / lengthSquared));
      const point: Vec2 = [a[0] + delta[0] * progress, a[1] + delta[1] * progress];
      const distance = Math.hypot(point[0], point[1]);
      if (!nearest || distance < nearest.distance) {
        const length = Math.sqrt(lengthSquared);
        nearest = { point, tangent: [delta[0] / length, delta[1] / length], distance };
      }
    }
  }
  return nearest;
}

function outsideNormal(feature: BuildingFeature, wall: WallProjection, origin: LngLat): Vec2 | null {
  const first: Vec2 = [-wall.tangent[1], wall.tangent[0]];
  const second: Vec2 = [-first[0], -first[1]];
  const firstInside = pointInFeature(feature, toLngLat(add(wall.point, first, 0.75), origin));
  const secondInside = pointInFeature(feature, toLngLat(add(wall.point, second, 0.75), origin));
  if (firstInside === secondInside) return null;
  return firstInside ? second : first;
}

function position3d(position: Vec2, origin: LngLat, altitude: number): [number, number, number] {
  const [longitude, latitude] = toLngLat(position, origin);
  return [longitude, latitude, altitude];
}

function groundArrow(wall: WallProjection, outside: Vec2, origin: LngLat): [number, number, number][] {
  const at = (normalDistance: number, tangentDistance: number) =>
    position3d(add(add(wall.point, outside, normalDistance), wall.tangent, tangentDistance), origin, 0.12);
  const points = [
    at(3.2, -0.25),
    at(1.1, -0.25),
    at(1.1, -0.75),
    at(0.15, 0),
    at(1.1, 0.75),
    at(1.1, 0.25),
    at(3.2, 0.25),
  ];
  return [...points, points[0]];
}

function doorOutline(
  wall: WallProjection,
  outside: Vec2,
  origin: LngLat,
  doorCount: number | null,
): [number, number, number][] {
  const width = Math.min(1.8, Math.max(0.8, (doorCount ?? 1) * 0.85));
  const center = add(wall.point, outside, 0.08);
  const left = add(center, wall.tangent, -width / 2);
  const right = add(center, wall.tangent, width / 2);
  const bottom = 0.1;
  const top = 2.2;
  return [
    position3d(left, origin, bottom),
    position3d(left, origin, top),
    position3d(right, origin, top),
    position3d(right, origin, bottom),
    position3d(left, origin, bottom),
  ];
}

/** Derives map markers from verified entrances that project to unambiguous footprint walls. */
export function buildEntranceMarkers(
  buildings: FeatureCollection,
  entrances: EntranceFeatureCollection,
  maxWallDistanceMeters = DEFAULT_MAX_WALL_DISTANCE_METERS,
): EntranceMarker[] {
  const byCode = new Map<string, BuildingFeature>();
  for (const feature of buildings.features) {
    if (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon") continue;
    const code = String(feature.properties?.BLDG_CODE ?? "").toUpperCase();
    if (code && !byCode.has(code)) byCode.set(code, feature as BuildingFeature);
  }

  const markers: EntranceMarker[] = [];
  for (const feature of entrances.features) {
    if (feature.geometry?.type !== "Point" || !finiteLngLat(feature.geometry.coordinates)) continue;
    const buildingCode = feature.properties.buildingCode.toUpperCase();
    const building = byCode.get(buildingCode);
    if (!building) continue;
    const entrance = feature.geometry.coordinates;
    const wall = nearestWall(building, entrance);
    if (!wall || wall.distance > maxWallDistanceMeters) continue;
    const outside = outsideNormal(building, wall, entrance);
    if (!outside) continue;
    markers.push({
      id: feature.properties.id,
      buildingCode,
      entranceType: feature.properties.entranceType,
      entrance,
      groundArrow: groundArrow(wall, outside, entrance),
      doorOutline: doorOutline(wall, outside, entrance, feature.properties.doorCount),
      wallTangent: wall.tangent,
      wallDistanceMeters: wall.distance,
    });
  }
  return markers;
}
