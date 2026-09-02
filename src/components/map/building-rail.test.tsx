// @vitest-environment happy-dom
import type { BuildingDetails, BuildingSummary } from "@/src/lib/api-types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BuildingRail,
  type BuildingDetailsState,
  type BuildingRailProps,
  type BuildingRouteState,
} from "./building-rail";

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
const chem: BuildingSummary = {
  ...iblc,
  code: "CHEM",
  name: "Chemistry Building",
  shortName: "Chemistry",
  aliases: [],
  address: "2036 Main Mall",
};

const source = (name: string) => ({
  state: "ready" as const,
  provenance: { sourceName: name, refreshedAt: "2026-08-24T07:00:00Z", association: "direct" as const },
});

const details: BuildingDetails = {
  code: "IBLC",
  name: iblc.name,
  building: {
    ...iblc,
    secondaryUsage: "Library",
    neighbourhood: "Academic",
    jurisdiction: "UBC",
    propertyType: "FeeSimple",
    hasSubbuildings: false,
    managingOrganization: "UBC",
    maintenanceOrganization: "UBC",
    constructionStatus: "Complete",
    constructionType: "Concrete",
    occupancyDate: "19270101",
    grossAreaSquareMeters: 27316,
    form: "Unspecified",
    condition: "Good",
    greenStatus: "LEED Gold",
  },
  addresses: [
    {
      fullAddress: "1961 East Mall",
      siteName: iblc.name,
      primary: true,
      official: true,
      mailing: true,
      pointType: "FrontDoor",
    },
  ],
  rooms: [
    {
      name: "IBLC 100",
      roomNumber: "100",
      spaceType: "classroom",
      capacity: 80,
      floor: 1,
      layout: "Rows",
      furniture: "Tables",
      photo: null,
      link: "https://learningspaces.ubc.ca/classrooms/iblc-100",
    },
  ],
  pois: [
    {
      name: "Library help desk",
      service_type: "campus_services",
      url: "https://learningcommons.ubc.ca",
      photo: null,
      hours: "9–5",
      contact: null,
      association: "official-address",
    },
  ],
  entrances: [{ id: "IBLC-1", entranceType: "Primary", doorCount: 2, position: [-123.252, 49.267] }],
  photos: [
    {
      url: "/api/preview?url=official",
      alt: "IBLC 100 in Irving K. Barber Learning Centre",
      sourceUrl: "https://learningspaces.ubc.ca/classrooms/iblc-100",
      sourceName: "UBC Learning Spaces",
      classification: "ubc-hosted",
    },
  ],
  availability: {
    as_of: "2026-08-11T08:33:32Z",
    freshness: "historical",
    rooms: [
      {
        title: "Bookable room",
        capacity: 6,
        url: "https://libcal.library.ubc.ca/space/1",
        thumbnail: null,
        freeNow: false,
        freeUntil: null,
        nextFree: "14:00",
      },
    ],
  },
  sourceStatus: {
    building: source("UBC Buildings"),
    addresses: source("UBC Addresses"),
    rooms: source("UBC Learning Spaces"),
    availability: source("UBC Library Room Bookings"),
    pois: source("UBC Points of Interest"),
    entrances: source("UBC Entrances"),
  },
};

function props(overrides: Partial<BuildingRailProps> = {}): BuildingRailProps {
  return {
    mode: "discover" as const,
    query: "",
    routeQuery: "",
    routeOrigin: null,
    routeField: null,
    endpointError: null,
    catalog: [chem, iblc],
    popular: [iblc, chem],
    favorites: new Set(["CHEM"]),
    favoriteStatus: "idle" as const,
    authenticated: true,
    selected: null,
    details: { status: "idle" } as BuildingDetailsState,
    route: { status: "idle" } as BuildingRouteState,
    shareStatus: "idle" as const,
    selectionError: null,
    onQueryChange: vi.fn(),
    onRouteQueryChange: vi.fn(),
    onRouteFieldChange: vi.fn(),
    onRouteEndpointSelect: vi.fn(),
    onSelect: vi.fn(),
    onBack: vi.fn(),
    onDirections: vi.fn(),
    onRetryRoute: vi.fn(),
    onRetryDetails: vi.fn(),
    onToggleFavorite: vi.fn(),
    onShare: vi.fn(),
    onCopyLink: vi.fn(),
    onOpenGoogleMaps: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("BuildingRail", () => {
  it("shows saved buildings before the curated starting list", () => {
    render(<BuildingRail {...props()} />);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Saved", "Curated popular buildings"]);
    expect(screen.getByText(/not a measure of foot traffic/)).toBeTruthy();
  });

  it("filters search and activates the keyboard-selected result", () => {
    const onSelect = vi.fn();
    render(<BuildingRail {...props({ query: "chem", onSelect })} />);
    const search = screen.getByRole("combobox", { name: "Search buildings" });

    fireEvent.keyDown(search, { key: "Enter" });

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(onSelect).toHaveBeenCalledWith(chem);
  });

  it("connects search to its listbox and clears unmatched queries with Escape", () => {
    const onQueryChange = vi.fn();
    render(<BuildingRail {...props({ query: "no match", onQueryChange })} />);
    const search = screen.getByRole("combobox", { name: "Search buildings" });

    expect(search.getAttribute("aria-controls")).toBeTruthy();
    expect(search.getAttribute("aria-expanded")).toBe("false");
    expect(search.getAttribute("aria-autocomplete")).toBe("list");
    fireEvent.keyDown(search, { key: "Escape" });
    expect(onQueryChange).toHaveBeenCalledWith("");
  });

  it("edits From and To through one transient endpoint list", () => {
    const onRouteFieldChange = vi.fn();
    const onRouteEndpointSelect = vi.fn();
    const routeProps = props({
      mode: "directions",
      selected: iblc,
      routeOrigin: chem,
      routeField: "origin",
      routeQuery: "chem",
      onRouteFieldChange,
      onRouteEndpointSelect,
    });
    const view = render(<BuildingRail {...routeProps} />);

    const from = screen.getByRole("combobox", { name: "From building" });
    expect(from.getAttribute("value")).toBe("chem");
    for (const inputClass of [
      "neu-inset",
      "bg-surface-container-low",
      "rounded-lg",
      "focus-visible:ring-2",
      "focus-visible:outline-none",
      "h-11",
      "text-xs",
      "sm:h-9",
    ]) {
      expect(from.className).toContain(inputClass);
    }
    expect(screen.getByRole("button", { name: "Back to building details" }).textContent).toBe("");
    expect(view.container.querySelector("[data-route-endpoints]")?.className).toContain("gap-x-3");
    expect(view.container.querySelector("[data-route-marker-track]")).toBeTruthy();
    expect(from.parentElement?.className).toContain("col-start-2");
    expect(screen.getByRole("combobox", { name: "To building" }).getAttribute("value")).toBe(iblc.name);
    expect(screen.getByRole("listbox", { name: "Starting building results" })).toBeTruthy();
    expect(screen.getByRole("option").getAttribute("tabindex")).toBe("-1");
    fireEvent.click(screen.getByRole("option"));
    expect(onRouteEndpointSelect).toHaveBeenCalledWith("origin", chem);

    view.rerender(
      <BuildingRail
        {...props({
          mode: "directions",
          selected: iblc,
          routeOrigin: chem,
          routeField: null,
          routeQuery: "",
          onRouteFieldChange,
        })}
      />,
    );
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByRole("combobox", { name: "From building" }).getAttribute("value")).toBe(chem.name);
    fireEvent.focus(screen.getByRole("combobox", { name: "To building" }));
    expect(onRouteFieldChange).toHaveBeenCalledWith("destination");
  });

  it("keeps broad endpoint results in one owned scroll region", () => {
    const catalog = Array.from({ length: 25 }, (_, index): BuildingSummary => ({
      ...iblc,
      code: `A${String(index).padStart(3, "0")}`,
      name: `Alpha Building ${index}`,
      aliases: [],
    }));
    const { container } = render(
      <BuildingRail
        {...props({
          mode: "directions",
          selected: iblc,
          catalog,
          routeField: "origin",
          routeQuery: "alpha",
        })}
      />,
    );

    const input = screen.getByRole("combobox", { name: "From building" });
    const list = screen.getByRole("listbox", { name: "Starting building results" });
    const scroller = container.querySelector("[data-route-results-scroll]");
    expect(screen.getAllByRole("option")).toHaveLength(20);
    expect(screen.getByText("20 results")).toBeTruthy();
    expect(scroller?.contains(input)).toBe(true);
    expect(scroller?.contains(list)).toBe(true);

    fireEvent.keyDown(input, { key: "End" });
    const options = screen.getAllByRole("option");
    expect(input.getAttribute("aria-activedescendant")).toBe(options.at(-1)?.id);
    expect(options.at(-1)?.getAttribute("aria-selected")).toBe("true");
    expect(options.at(-1)?.className).toContain("rounded-xl");
    expect(options.at(-1)?.className).toContain("neu-inset");
  });

  it("clears an endpoint query before cancelling endpoint editing", () => {
    const onRouteQueryChange = vi.fn();
    const onRouteFieldChange = vi.fn();
    const view = render(
      <BuildingRail
        {...props({
          mode: "directions",
          selected: iblc,
          routeField: "origin",
          routeQuery: "chem",
          onRouteQueryChange,
          onRouteFieldChange,
        })}
      />,
    );

    fireEvent.keyDown(screen.getByRole("combobox", { name: "From building" }), { key: "Escape" });
    expect(onRouteQueryChange).toHaveBeenCalledWith("");
    expect(onRouteFieldChange).not.toHaveBeenCalled();

    view.rerender(
      <BuildingRail
        {...props({
          mode: "directions",
          selected: iblc,
          routeField: "origin",
          routeQuery: "",
          onRouteQueryChange,
          onRouteFieldChange,
        })}
      />,
    );
    fireEvent.keyDown(screen.getByRole("combobox", { name: "From building" }), { key: "Escape" });
    expect(onRouteFieldChange).toHaveBeenCalledWith(null);
  });

  it("keeps details focused on useful building destinations and sources", () => {
    render(
      <BuildingRail {...props({ mode: "details", selected: iblc, details: { status: "ready", data: details } })} />,
    );

    expect(screen.getByRole("heading", { name: iblc.name })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to all buildings" }).textContent).toBe("");
    expect(screen.queryByRole("heading", { name: "Building" })).toBeNull();
    expect(screen.queryByText("LEED Gold")).toBeNull();
    expect(screen.queryByText("FeeSimple")).toBeNull();
    expect(screen.getByText("IBLC 100")).toBeTruthy();
    expect(screen.getByText("Bookable room")).toBeTruthy();
    expect(screen.getByText("Library help desk")).toBeTruthy();
    expect(screen.getByText("Primary")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sources" })).toBeTruthy();
    expect(screen.getByText(/Historical snapshot/)).toBeTruthy();
  });

  it("keeps official source access when a photo fails", () => {
    render(
      <BuildingRail {...props({ mode: "details", selected: iblc, details: { status: "ready", data: details } })} />,
    );
    fireEvent.error(screen.getByRole("img", { name: /IBLC 100/ }));

    expect(screen.queryByRole("img", { name: /IBLC 100/ })).toBeNull();
    expect(screen.getByText("Photo unavailable.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /UBC Learning Spaces/ })).toBeTruthy();
  });

  it("offers copy after native share dismissal", () => {
    const onCopyLink = vi.fn();
    render(
      <BuildingRail
        {...props({
          mode: "details",
          selected: iblc,
          details: { status: "loading" },
          shareStatus: "copy",
          onCopyLink,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(onCopyLink).toHaveBeenCalledOnce();
  });

  it("shows route results without a redundant map action", () => {
    const route: BuildingRouteState = {
      status: "network",
      from: chem,
      to: iblc,
      route: {
        from: "CHEM",
        to: "IBLC",
        meters: 900,
        minutes: 12,
        method: "network",
        polyline: [chem.centroid, iblc.centroid],
      },
    };
    const view = render(<BuildingRail {...props({ mode: "directions", selected: iblc, routeOrigin: chem, route })} />);

    expect(screen.getByText("Campus walking network")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View route" })).toBeNull();

    view.rerender(
      <BuildingRail
        {...props({
          mode: "directions",
          selected: iblc,
          routeOrigin: chem,
          route: {
            ...route,
            status: "estimate",
            route: { ...route.route, method: "estimate", polyline: [] },
          },
        })}
      />,
    );
    expect(screen.getByText(/Straight-line estimate/)).toBeTruthy();
  });

  it("exposes every selected-building action", () => {
    const actions = {
      onDirections: vi.fn(),
      onToggleFavorite: vi.fn(),
      onShare: vi.fn(),
      onOpenGoogleMaps: vi.fn(),
    };
    render(
      <BuildingRail {...props({ mode: "details", selected: iblc, details: { status: "loading" }, ...actions })} />,
    );

    for (const name of ["Directions", "Save", "Share", "Google Maps"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(screen.queryByRole("button", { name: "Show on map" })).toBeNull();
    expect(actions.onDirections).toHaveBeenCalledOnce();
    expect(actions.onToggleFavorite).toHaveBeenCalledWith("IBLC");
    expect(actions.onShare).toHaveBeenCalledOnce();
    expect(actions.onOpenGoogleMaps).toHaveBeenCalledOnce();
  });
});
