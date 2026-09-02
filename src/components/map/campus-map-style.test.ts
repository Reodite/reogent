import { describe, expect, it } from "vitest";
import { routeLayerAppearance } from "./campus-map";

describe("routeLayerAppearance", () => {
  it("uses the original primary route palette above map depth", () => {
    expect(routeLayerAppearance("light")).toEqual({
      traceColor: [74, 78, 122, 235],
      casingColor: [250, 250, 250, 190],
      parameters: { depthTest: false },
    });
    expect(routeLayerAppearance("dark")).toEqual({
      traceColor: [176, 180, 216, 220],
      casingColor: [18, 18, 20, 190],
      parameters: { depthTest: false },
    });
  });
});
