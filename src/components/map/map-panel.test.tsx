// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell } from "@/src/components/chat/chat-shell-context";
import type { BuildingSummary, RouteResponse } from "@/src/lib/api-types";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
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
const routerPush = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ pathname: "/tools/map", params: new URLSearchParams(), suspended: false }));
const pendingNavigation = new Promise(() => {});
const mapState = vi.hoisted(() => ({
  onStatus: undefined as ((status: "loading" | "ready" | "error") => void) | undefined,
}));

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
const nest: BuildingSummary = {
  ...iblc,
  code: "NEST",
  name: "AMS Student Nest",
  shortName: "The Nest",
  aliases: [],
  address: "6133 University Boulevard",
  centroid: [-123.249, 49.266],
};
const chem: BuildingSummary = {
  ...iblc,
  code: "CHEM",
  name: "Chemistry Building",
  shortName: "Chemistry",
  aliases: [],
  address: "2036 Main Mall",
  centroid: [-123.254, 49.265],
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
  useSearchParams: () => {
    if (navigation.suspended) throw pendingNavigation;
    return navigation.params;
  },
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}));
vi.mock("@/src/components/map/campus-map", () => ({
  CampusMap: (props: {
    highlight?: { kind?: string } | null;
    selectedBuilding?: BuildingSummary | null;
    onBuildingSelect?: (building: BuildingSummary) => void;
    showBuildingPopup?: boolean;
    controls?: { current: unknown };
    onStatus?: (status: "loading" | "ready" | "error") => void;
  }) => {
    mapState.onStatus = props.onStatus;
    if (props.controls) {
      props.controls.current = { zoomIn: vi.fn(), zoomOut: vi.fn(), resetView: vi.fn(), resize };
    }
    return (
      <div
        data-testid="campus-map"
        data-highlight={props.highlight?.kind ?? ""}
        data-selected={props.selectedBuilding?.code ?? ""}
        data-popup={String(props.showBuildingPopup)}
      >
        <button type="button" onClick={() => props.onBuildingSelect?.(iblc)}>
          Select IBLC on map
        </button>
        <button type="button" onClick={() => props.onBuildingSelect?.(nest)}>
          Select NEST on map
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
    {
      type: "Feature",
      properties: {
        BLDG_CODE: "NEST",
        NAME: nest.name,
        SHORTNAME: nest.shortName,
        PRIMARY_ADDRESS: nest.address,
        POSTAL_CODE: nest.postalCode,
        BLDG_USAGE: nest.usage,
        BLDG_STATE: nest.state,
        MAX_FLOORS: nest.floors,
        BLDG_HEIGHT: nest.heightMeters,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-123.25, 49.265],
            [-123.248, 49.265],
            [-123.248, 49.267],
            [-123.25, 49.267],
            [-123.25, 49.265],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        BLDG_CODE: "CHEM",
        NAME: chem.name,
        SHORTNAME: chem.shortName,
        PRIMARY_ADDRESS: chem.address,
        POSTAL_CODE: chem.postalCode,
        BLDG_USAGE: chem.usage,
        BLDG_STATE: chem.state,
        MAX_FLOORS: chem.floors,
        BLDG_HEIGHT: chem.heightMeters,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-123.255, 49.264],
            [-123.253, 49.264],
            [-123.253, 49.266],
            [-123.255, 49.266],
            [-123.255, 49.264],
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
  navigation.suspended = false;
  mapState.onStatus = undefined;
  auth.isGuest = false;
  resize.mockReset();
  routerPush.mockReset();
  api.listSessions.mockReset().mockResolvedValue([]);
  api.getGeo.mockReset().mockResolvedValue(buildingGeo);
  api.getBuildingDetails.mockReset().mockReturnValue(new Promise(() => {}));
  api.getBuildingFavorites.mockReset().mockResolvedValue({ codes: [] });
  api.setBuildingFavorite.mockReset().mockResolvedValue({ codes: ["IBLC"] });
  api.getRoute.mockReset().mockImplementation(async (from: string, to: string) => ({
    from,
    to,
    meters: 185,
    minutes: 3,
    method: "network",
    polyline: [nest.centroid, iblc.centroid],
  }));
  Object.defineProperty(window.navigator, "share", { configurable: true, value: undefined });
  Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: undefined });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderMap(mode: "tools" | "ai" = "tools") {
  navigation.pathname = mode === "tools" ? "/tools/map" : "/chat";
  return render(
    <ChatShellProvider initialMode={mode}>
      <MapArea />
    </ChatShellProvider>,
  );
}

function AiRouteMap() {
  const { setWorkspaceView } = useChatShell();
  useEffect(() => {
    setWorkspaceView({
      paneId: "map",
      state: {
        highlight: {
          kind: "route",
          from: "CHEM",
          to: "IBLC",
          meters: 900,
          minutes: 12,
          method: "network",
          path: [[-123.256, 49.263], iblc.centroid],
        },
      },
    });
  }, [setWorkspaceView]);
  return <MapArea />;
}

describe("MapArea", () => {
  it("keeps the native canvas and controls mounted through startup in AI", () => {
    const { container } = renderMap("ai");
    const map = screen.getByTestId("campus-map");
    const zoom = screen.getByRole("button", { name: "Zoom in" });
    const loading = screen.getByRole("status", { name: "Loading campus map" });

    expect(loading.className).toContain("absolute inset-0");
    expect(loading.querySelector("[data-skeleton]")?.className).toContain("h-full w-full");
    expect(container.querySelector("[data-workspace-page]")).toBeNull();
    const surface = container.querySelector("[data-map-status]");
    expect(surface?.classList.contains("rounded-[inherit]")).toBe(true);
    expect(surface?.classList.contains("overflow-hidden")).toBe(true);
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.getByRole("button", { name: "Show walking paths" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset view" })).toBeTruthy();
    act(() => mapState.onStatus?.("ready"));
    expect(screen.queryByRole("status", { name: "Loading campus map" })).toBeNull();
    expect(screen.getByTestId("campus-map")).toBe(map);
    expect(screen.getByRole("button", { name: "Zoom in" })).toBe(zoom);
    expect(container.querySelector("[data-map-status]")?.getAttribute("aria-busy")).toBe("false");
  });

  it("keeps grouped zoom focus paint outside the well without changing control targets", async () => {
    const { container } = renderMap("ai");
    await act(async () => {});
    const well = container.querySelector("[data-map-zoom-controls]")!;
    expect(well.classList.contains("overflow-hidden")).toBe(false);
    expect(well.classList.contains("rounded-xl")).toBe(true);
    for (const name of ["Show walking paths", "Reset view"]) {
      expect(screen.getByRole("button", { name }).classList.contains("rounded-xl")).toBe(true);
    }
    for (const [name, corner] of [
      ["Zoom in", "rounded-t-xl"],
      ["Zoom out", "rounded-b-xl"],
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button.parentElement).toBe(well);
      expect(button.classList.contains(corner)).toBe(true);
      expect(button.classList.contains("size-11")).toBe(true);
      expect(button.classList.contains("sm:size-10")).toBe(true);
      expect(button.classList.contains("focus-visible:ring-2")).toBe(true);
    }
  });

  it("keeps the map timeout and retry distinct from loading", () => {
    vi.useFakeTimers();
    renderMap("ai");
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.getByText("Map unavailable")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading campus map" })).toBeNull();
    expect(screen.queryByTestId("campus-map")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("status", { name: "Loading campus map" })).toBeTruthy();
    expect(screen.getByTestId("campus-map")).toBeTruthy();
    act(() => mapState.onStatus?.("ready"));
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.queryByText("Map unavailable")).toBeNull();
  });

  it("reserves the split Explore sheet and map during navigation suspension", () => {
    navigation.suspended = true;
    const { container } = renderMap();
    expect(container.querySelectorAll("[data-workspace-page]")).toHaveLength(1);
    expect(container.querySelector("[data-workspace-composition='split']")).toBeTruthy();
    expect(container.querySelector("[data-map-explorer]")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Campus map" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading building catalog" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading campus map" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Explore" }));
    expect(screen.getByRole("button", { name: "Collapse Explore" })).toBeTruthy();
    expect(container.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-view")).toBe("rail");
  });

  it("uses an inset catalog list and preserves map access through catalog retry", async () => {
    api.getGeo.mockRejectedValueOnce(new Error("offline"));
    const { container } = renderMap();
    const loading = screen.getByRole("status", { name: "Loading building catalog" });
    expect(loading.className).toContain("px-5 py-3");
    expect(loading.closest("[data-workspace-panel-body]")?.className).toContain("p-0");
    expect(loading.querySelectorAll("[data-skeleton]")).toHaveLength(18);
    const map = screen.getByTestId("campus-map");
    const recovery = (await screen.findByText("Building catalog unavailable")).closest('[role="alert"]');
    expect(recovery?.className).toContain("min-h-full");
    expect(recovery?.className).toContain("justify-center");
    expect(recovery?.className).toContain("text-center");
    expect(recovery?.closest("[data-workspace-panel-body]")?.className).toContain("overflow-y-auto");
    expect(screen.queryByRole("status", { name: "Loading building catalog" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("combobox", { name: "Search buildings" });
    expect(screen.getByTestId("campus-map")).toBe(map);
    expect(container.querySelector("[data-workspace-composition='split']")).toBeTruthy();
  });

  it("renders the search rail only in Tools", async () => {
    const tools = renderMap("tools");
    await screen.findByText(iblc.name);
    expect(tools.container.querySelector("[data-workspace-composition='split']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open Explore" }).textContent).toContain("Buildings, rooms, services");
    expect(screen.getByRole("combobox", { name: "Search buildings" })).toBeTruthy();
    cleanup();

    const ai = renderMap("ai");
    expect(ai.container.querySelector("[data-workspace-composition='split']")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Explore" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Search buildings" })).toBeNull();
  });

  it("keeps the floating route summary in AI only", async () => {
    navigation.pathname = "/chat";
    render(
      <ChatShellProvider initialMode="ai">
        <AiRouteMap />
      </ChatShellProvider>,
    );

    expect(await screen.findByText("12 min")).toBeTruthy();
    expect(screen.getByText("Walking route · 900 m · CHEM → IBLC")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Explore" })).toBeNull();
  });

  it("moves a map selection into Tools building details without a duplicate popup", async () => {
    const { container } = renderMap();
    await screen.findByText(iblc.name);

    fireEvent.click(screen.getByRole("button", { name: "Select IBLC on map" }));

    expect(await screen.findByRole("heading", { name: iblc.name })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse Explore" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("campus-map").dataset.selected).toBe("IBLC");
    expect(screen.getByTestId("campus-map").dataset.popup).toBe("false");
    expect(container.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-view")).toBe("rail");
    expect(new URL(window.location.href).searchParams.get("building")).toBe("IBLC");
  });

  it("preserves a guest's selected building through sign-in", async () => {
    auth.isGuest = true;
    renderMap();
    await screen.findByText(iblc.name);
    fireEvent.click(screen.getByRole("button", { name: "Select IBLC on map" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign in to save" }));

    expect(routerPush).toHaveBeenCalledWith(`/login?redirect=${encodeURIComponent("/tools/map?building=IBLC")}`);
    expect(api.listSessions).not.toHaveBeenCalled();
  });

  it("offers clipboard copy after the native share sheet is dismissed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException("dismissed", "AbortError")),
    });
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    renderMap();
    await screen.findByText(iblc.name);
    fireEvent.click(screen.getByRole("button", { name: "Select IBLC on map" }));
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("building=IBLC")));
  });

  it("keeps the map mounted while the Explore sheet expands and collapses", async () => {
    renderMap();
    await screen.findByText(iblc.name);
    const map = screen.getByTestId("campus-map");

    fireEvent.click(screen.getByRole("button", { name: "Open Explore" }));
    const collapse = screen.getByRole("button", { name: "Collapse Explore" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(collapse, { key: "Escape" });

    expect(screen.getByRole("button", { name: "Open Explore" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("campus-map")).toBe(map);
  });

  it("restores a selected building from the URL", async () => {
    navigation.params = new URLSearchParams("building=IBLC");
    renderMap();

    expect(await screen.findByRole("heading", { name: iblc.name })).toBeTruthy();
    expect(screen.getByTestId("campus-map").dataset.selected).toBe("IBLC");
  });

  it.each(["iccs", " íccs "])("loads details for normalized URL code %s", async (code) => {
    const source = { state: "ready", provenance: { sourceName: "UBC Buildings", refreshedAt: null } };
    api.getGeo.mockResolvedValue({
      ...buildingGeo,
      features: [{ ...buildingGeo.features[0], properties: { BLDG_CODE: "ICCS", NAME: "Computer Science" } }],
    });
    api.getBuildingDetails.mockResolvedValue({
      building: { code: "ICCS", name: "Computer Science" },
      addresses: [],
      rooms: [],
      pois: [],
      photos: [],
      sourceStatus: { building: source, addresses: source, rooms: source, pois: source },
    });
    navigation.params = new URLSearchParams({ building: code });
    window.history.replaceState(null, "", `/tools/map?${navigation.params}`);
    const historyLength = window.history.length;
    renderMap();

    expect(await screen.findByText("UBC Buildings")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading building details" })).toBeNull();
    expect(api.getBuildingDetails).toHaveBeenCalledWith("ICCS", expect.any(AbortSignal));
    expect(new URL(window.location.href).searchParams.get("building")).toBe(code);
    expect(window.history.length).toBe(historyLength);
  });

  it("handles normalized history selections, detail failures and unknown codes", async () => {
    navigation.params = new URLSearchParams("building=IBLC");
    const view = renderMap();
    await screen.findByRole("heading", { name: iblc.name });
    api.getBuildingDetails.mockRejectedValue(new Error("offline"));
    navigation.params = new URLSearchParams({ building: " nest " });
    view.rerender(
      <ChatShellProvider initialMode="tools">
        <MapArea />
      </ChatShellProvider>,
    );
    expect(await screen.findByText("Couldn't load building details.")).toBeTruthy();
    expect(api.getBuildingDetails).toHaveBeenLastCalledWith("NEST", expect.any(AbortSignal));
    expect(screen.getByTestId("campus-map").dataset.selected).toBe("NEST");

    navigation.params = new URLSearchParams("building=UNKNOWN");
    view.rerender(
      <ChatShellProvider initialMode="tools">
        <MapArea />
      </ChatShellProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Building “UNKNOWN” is not in the current catalog.",
    );
    expect(screen.getByTestId("campus-map").dataset.selected).toBe("");
    expect(api.getBuildingDetails).toHaveBeenCalledTimes(2);
  });

  it("waits for the initial favorites load before saving and blocks duplicate saves", async () => {
    let resolveLoad: (result: { codes: string[] }) => void = () => {};
    let resolveSave: (result: { codes: string[] }) => void = () => {};
    api.getBuildingFavorites.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );
    api.setBuildingFavorite.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    navigation.params = new URLSearchParams("building=IBLC");
    renderMap();
    const save = await screen.findByRole("button", { name: "Save" });
    fireEvent.click(save);
    expect(api.setBuildingFavorite).not.toHaveBeenCalled();
    expect((save as HTMLButtonElement).disabled).toBe(true);

    await act(async () => resolveLoad({ codes: ["CHEM"] }));
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    expect(api.setBuildingFavorite).toHaveBeenCalledWith("IBLC", true);
    const saved = screen.getByRole("button", { name: "Saved" });
    expect((saved as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(saved);
    expect(api.setBuildingFavorite).toHaveBeenCalledOnce();
    await act(async () => resolveSave({ codes: ["IBLC", "CHEM"] }));
    expect((screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Back to all buildings" }));
    expect(screen.getByRole("listbox", { name: "Saved" }).textContent).toContain(iblc.name);
    expect(screen.getByRole("listbox", { name: "Saved" }).textContent).toContain(chem.name);
  });

  it("changes either endpoint and removes results after routing", async () => {
    navigation.params = new URLSearchParams("building=IBLC");
    renderMap();
    await screen.findByRole("heading", { name: iblc.name });
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    fireEvent.change(screen.getByRole("combobox", { name: "From building" }), {
      target: { value: "NEST" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /AMS Student Nest/ }));
    await waitFor(() => expect(api.getRoute).toHaveBeenCalledWith("NEST", "IBLC", expect.any(AbortSignal)));
    expect(screen.queryByRole("option")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open Explore" }));
    const destination = screen.getByRole("combobox", { name: "To building" });
    fireEvent.focus(destination);
    fireEvent.change(destination, { target: { value: "CHEM" } });
    fireEvent.click(await screen.findByRole("option", { name: /Chemistry Building/ }));

    await waitFor(() => expect(api.getRoute).toHaveBeenLastCalledWith("NEST", "CHEM", expect.any(AbortSignal)));
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByTestId("campus-map").dataset.selected).toBe("CHEM");
    expect(new URL(window.location.href).searchParams.get("building")).toBe("CHEM");
  });

  it("rejects identical endpoints without requesting a route", async () => {
    navigation.params = new URLSearchParams("building=IBLC");
    renderMap();
    await screen.findByRole("heading", { name: iblc.name });
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    fireEvent.change(screen.getByRole("combobox", { name: "From building" }), {
      target: { value: "IBLC" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /Irving K. Barber/ }));

    expect(screen.getByText("Choose two different buildings.")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "From building" }).getAttribute("aria-invalid")).toBe("true");
    expect(api.getRoute).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox", { name: "Starting building results" })).toBeTruthy();
  });

  it("invalidates a pending route when leaving Directions", async () => {
    let resolveRoute: ((route: RouteResponse) => void) | undefined;
    api.getRoute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRoute = resolve;
        }),
    );
    navigation.params = new URLSearchParams("building=IBLC");
    renderMap();
    await screen.findByRole("heading", { name: iblc.name });
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    fireEvent.change(screen.getByRole("combobox", { name: "From building" }), {
      target: { value: "NEST" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /AMS Student Nest/ }));
    expect(await screen.findAllByText("Finding a walking route…")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Back to building details" }));

    resolveRoute?.({
      from: "NEST",
      to: "IBLC",
      meters: 185,
      minutes: 3,
      method: "network",
      polyline: [nest.centroid, iblc.centroid],
    });
    await waitFor(() => expect(screen.getByTestId("campus-map").dataset.highlight).toBe("buildings"));
    expect(screen.getByRole("heading", { name: iblc.name })).toBeTruthy();
    expect(screen.queryByText("Campus walking network")).toBeNull();
  });

  it("layers Escape from endpoint query to editor to compact sheet", async () => {
    navigation.params = new URLSearchParams("building=IBLC");
    renderMap();
    await screen.findByRole("heading", { name: iblc.name });
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    fireEvent.change(screen.getByRole("combobox", { name: "From building" }), {
      target: { value: "NEST" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /AMS Student Nest/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Explore" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Open Explore" }));

    const origin = screen.getByRole("combobox", { name: "From building" });
    fireEvent.focus(origin);
    fireEvent.keyDown(origin, { key: "Escape" });
    expect((origin as HTMLInputElement).value).toBe("");
    fireEvent.keyDown(origin, { key: "Escape" });
    expect((origin as HTMLInputElement).value).toBe(nest.name);
    fireEvent.keyDown(origin, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open Explore" })).toBeTruthy();
  });

  it("accepts only the latest endpoint-pair response", async () => {
    let resolveFirst: ((route: RouteResponse) => void) | undefined;
    let resolveSecond: ((route: RouteResponse) => void) | undefined;
    api.getRoute
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    navigation.params = new URLSearchParams("building=IBLC");
    renderMap();
    await screen.findByRole("heading", { name: iblc.name });
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    fireEvent.change(screen.getByRole("combobox", { name: "From building" }), {
      target: { value: "NEST" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /AMS Student Nest/ }));

    const origin = screen.getByRole("combobox", { name: "From building" });
    fireEvent.focus(origin);
    fireEvent.change(origin, { target: { value: "CHEM" } });
    fireEvent.click(await screen.findByRole("option", { name: /Chemistry Building/ }));
    resolveSecond?.({
      from: "CHEM",
      to: "IBLC",
      meters: 900,
      minutes: 12,
      method: "network",
      polyline: [chem.centroid, iblc.centroid],
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Explore" }).textContent).toContain("CHEM"));

    resolveFirst?.({
      from: "NEST",
      to: "IBLC",
      meters: 185,
      minutes: 3,
      method: "network",
      polyline: [nest.centroid, iblc.centroid],
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Explore" }).textContent).toContain("CHEM"));
    expect(screen.getByRole("button", { name: "Open Explore" }).textContent).not.toContain("NEST");
  });

  it("keeps Explore open when a network response has no drawable route", async () => {
    navigation.params = new URLSearchParams("building=IBLC");
    api.getRoute.mockResolvedValueOnce({
      from: "NEST",
      to: "IBLC",
      meters: 185,
      minutes: 3,
      method: "network",
      polyline: [],
    });
    renderMap();
    await screen.findByRole("heading", { name: iblc.name });
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    fireEvent.change(screen.getByRole("combobox", { name: "From building" }), {
      target: { value: "NEST" },
    });
    fireEvent.click(await screen.findByRole("option"));

    expect(await screen.findByText("Couldn't calculate this route.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse Explore" })).toBeTruthy();
    expect(screen.getByTestId("campus-map").dataset.highlight).toBe("buildings");
  });

  it("clears a displayed route when browser history clears the selected building", async () => {
    navigation.params = new URLSearchParams("building=IBLC");
    const view = renderMap();
    await screen.findByRole("heading", { name: iblc.name });
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    fireEvent.change(screen.getByRole("combobox", { name: "From building" }), {
      target: { value: "NEST" },
    });
    fireEvent.click(await screen.findByRole("option"));
    await waitFor(() => expect(screen.getByTestId("campus-map").dataset.highlight).toBe("route"));
    expect(api.getRoute).toHaveBeenCalledWith("NEST", "IBLC", expect.any(AbortSignal));
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByRole("button", { name: "Open Explore" }).textContent).toContain("3 min walk");
    expect(screen.queryByText("Walking route · 185 m · NEST → IBLC")).toBeNull();

    navigation.params = new URLSearchParams();
    view.rerender(
      <ChatShellProvider initialMode="tools">
        <MapArea />
      </ChatShellProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("campus-map").dataset.highlight).toBe(""));
  });
});
