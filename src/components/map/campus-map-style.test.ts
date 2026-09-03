import { describe, expect, it } from "vitest";
import {
  buildingLayerAppearance,
  doorLayerAppearance,
  groundEntranceLayerAppearance,
  routeLayerAppearance,
  routeRenderPath,
} from "./campus-map";

describe("map depth appearance", () => {
  it("keeps buildings opaque and depth-writing", () => {
    for (const theme of ["light", "dark"] as const) {
      const building = buildingLayerAppearance(theme);
      expect(building.fillColor[3]).toBe(255);
      expect(building.highlightColor[3]).toBe(255);
      expect(building.parameters).toEqual({ depthCompare: "less-equal", depthWriteEnabled: true });
    }
  });

  it("keeps door outlines visible without writing wall depth", () => {
    expect(doorLayerAppearance().parameters).toEqual({ depthCompare: "less-equal", depthWriteEnabled: false });
    expect(doorLayerAppearance().getPolygonOffset()).toEqual([-1, -1]);
  });

  it("keeps ground entrance arrows above the basemap without writing depth", () => {
    expect(groundEntranceLayerAppearance().parameters).toEqual({
      depthCompare: "less-equal",
      depthWriteEnabled: false,
    });
    expect(groundEntranceLayerAppearance().getPolygonOffset()).toEqual([-1, -1]);
  });

  it("partitions route strokes into occluded and visible depth passes", () => {
    expect(routeLayerAppearance("light").strokes).toEqual([
      {
        id: "route-occluded",
        width: 9,
        color: [74, 78, 122, 77],
        parameters: { depthCompare: "greater", depthWriteEnabled: false },
      },
      {
        id: "route-casing",
        width: 9,
        color: [250, 250, 250, 255],
        parameters: { depthCompare: "less-equal", depthWriteEnabled: false },
      },
      {
        id: "route-trace",
        width: 5,
        color: [74, 78, 122, 255],
        parameters: { depthCompare: "less-equal", depthWriteEnabled: false },
      },
    ]);
    expect(routeLayerAppearance("dark").strokes.map(({ id, color }) => ({ id, color }))).toEqual([
      { id: "route-occluded", color: [176, 180, 216, 77] },
      { id: "route-casing", color: [18, 18, 20, 255] },
      { id: "route-trace", color: [176, 180, 216, 255] },
    ]);
    expect(routeLayerAppearance("light").getPolygonOffset()).toEqual([0, 0]);
  });

  it("lifts every route vertex above flat ground", () => {
    expect(
      routeRenderPath([
        [-123.25, 49.26],
        [-123.24, 49.27],
      ]),
    ).toEqual([
      [-123.25, 49.26, 0.2],
      [-123.24, 49.27, 0.2],
    ]);
  });
});
