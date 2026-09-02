// @vitest-environment happy-dom
import { ChatShellProvider } from "@/src/components/chat/chat-shell-context";
import type { BuildingSummary } from "@/src/lib/api-types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resize = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({
  listSessions: vi.fn(),
  getGeo: vi.fn(),
  getBuildingDetails: vi.fn(),
  getBuildingFavorites: vi.fn(),
  setBuildingFavorite: vi.fn(),
  getRoute: vi.fn(),
}));
const auth = vi.hoisted(() => ({ isGuest: false }));
const navigation = vi.hoisted(() => ({ pathname: "/tools/map", params: new URLSearchParams() }));

const iblc: BuildingSummary = {
  code: "IBLC",
  name: "Irving K. Barber Learning Centre",
  shortName: "I.K. Barber",
  aliases: ["IKB"],
  address: "1961 East Mall",
  postalCode: "V6T 1Z1",
  usage: "Academic",
  state: "Occupied",
  floors: 5,
  heightMeters: 26.87,
  centroid: [-123.252, 49.267],
};

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, className }: { children: ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
  useReducedMotion: () => true,
}));
vi.mock("@/src/components/providers", () => ({
  useApi: () => api,
  useTheme: () => ({ theme: "light" }),
}));
vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ status: "signedIn", isGuest: auth.isGuest }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/src/components/map/campus-map", () => ({
  CampusMap: (props: {
    selectedBuilding?: BuildingSummary | null;
    onBuildingSelect?: (building: BuildingSummary) => void;
    showBuildingPopup?: boolean;
    controls?: { current: unknown };
  }) => {
    if (props.controls) {
      props.controls.current = { zoomIn: vi.fn(), zoomOut: vi.fn(), resetView: vi.fn(), resize };
    }
    return (
      <div
        data-testid="campus-map"
        data-selected={props.selectedBuilding?.code ?? ""}
        data-popup={String(props.showBuildingPopup)}
      >
        <button type="button" onClick={() => props.onBuildingSelect?.(iblc)}>
          Select IBLC on map
        </button>
      </div>
    );
  },
}));

const { MapArea } = await import("./map-panel");

const buildingGeo = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        BLDG_CODE: "IBLC",
        NAME: iblc.name,
        SHORTNAME: iblc.shortName,
        PRIMARY_ADDRESS: iblc.address,
        POSTAL_CODE: iblc.postalCode,
        BLDG_USAGE: iblc.usage,
        BLDG_STATE: iblc.state,
        MAX_FLOORS: iblc.floors,
        BLDG_HEIGHT: iblc.heightMeters,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-123.253, 49.266],
            [-123.251, 49.266],
            [-123.251, 49.268],
            [-123.253, 49.268],
            [-123.253, 49.266],
          ],
        ],
      },
    },
  ],
};

beforeEach(() => {
  window.history.replaceState(null, "", "/tools/map");
  navigation.pathname = "/tools/map";
  navigation.params = new URLSearchParams();
  auth.isGuest = false;
  resize.mockReset();
  api.listSessions.mockReset().mockResolvedValue([]);
  api.getGeo.mockReset().mockResolvedValue(buildingGeo);
  api.getBuildingDetails.mockReset().mockReturnValue(new Promise(() => {}));
  api.getBuildingFavorites.mockReset().mockResolvedValue({ codes: [] });
  api.setBuildingFavorite.mockReset().mockResolvedValue({ codes: ["IBLC"] });
  api.getRoute.mockReset();
  Object.defineProperty(window.navigator, "share", { configurable: true, value: undefined });
});

afterEach(cleanup);

function renderMap(mode: "tools" | "ai" = "tools") {
  navigation.pathname = mode === "tools" ? "/tools/map" : "/chat";
  return render(
    <ChatShellProvider initialMode={mode}>
      <MapArea />
    </ChatShellProvider>,
  );
}

describe("MapArea", () => {
  it("renders the search rail only in Tools", async () => {
    const tools = renderMap("tools");
    await screen.findByText(iblc.name);
    expect(tools.container.querySelector("[data-workspace-composition='split']")).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Search buildings" })).toBeTruthy();
    cleanup();

    const ai = renderMap("ai");
    expect(ai.container.querySelector("[data-workspace-composition='split']")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Search buildings" })).toBeNull();
  });

  it("moves a map selection into Tools building details without a duplicate popup", async () => {
    const { container } = renderMap();
    await screen.findByText(iblc.name);

    fireEvent.click(screen.getByRole("button", { name: "Select IBLC on map" }));

    expect(await screen.findByRole("heading", { name: iblc.name })).toBeTruthy();
    expect(screen.getByTestId("campus-map").dataset.selected).toBe("IBLC");
    expect(screen.getByTestId("campus-map").dataset.popup).toBe("false");
    expect(container.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-view")).toBe("rail");
    expect(new URL(window.location.href).searchParams.get("building")).toBe("IBLC");
  });

  it("resizes the still-mounted map after compact view switching", async () => {
    renderMap();
    await screen.findByText(iblc.name);
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));
    fireEvent.click(screen.getByRole("button", { name: "Map" }));

    await waitFor(() => expect(resize).toHaveBeenCalled());
  });

  it("restores a selected building from the URL", async () => {
    navigation.params = new URLSearchParams("building=IBLC");
    renderMap();

    expect(await screen.findByRole("heading", { name: iblc.name })).toBeTruthy();
    expect(screen.getByTestId("campus-map").dataset.selected).toBe("IBLC");
  });
});
