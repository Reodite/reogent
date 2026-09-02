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
    originQuery: "",
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
    onOriginQueryChange: vi.fn(),
    onSelect: vi.fn(),
    onBack: vi.fn(),
    onShowMap: vi.fn(),
    onDirections: vi.fn(),
    onRoute: vi.fn(),
    onRetryRoute: vi.fn(),
    onRetryDetails: vi.fn(),
    onToggleFavorite: vi.fn(),
    onSignIn: vi.fn(),
    onShare: vi.fn(),
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
    const search = screen.getByRole("textbox", { name: "Search buildings" });

    fireEvent.keyDown(search, { key: "Enter" });

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(onSelect).toHaveBeenCalledWith(chem);
  });

  it("renders comprehensive building, room, booking, service, entrance, and source sections", () => {
    render(
      <BuildingRail {...props({ mode: "details", selected: iblc, details: { status: "ready", data: details } })} />,
    );

    expect(screen.getByRole("heading", { name: iblc.name })).toBeTruthy();
    expect(screen.getByText("LEED Gold")).toBeTruthy();
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

  it("labels estimates without offering a route-map action", () => {
    const route: BuildingRouteState = {
      status: "estimate",
      from: chem,
      to: iblc,
      route: { from: "CHEM", to: "IBLC", meters: 900, minutes: 12, method: "estimate", polyline: [] },
    };
    render(<BuildingRail {...props({ mode: "directions", selected: iblc, route })} />);

    expect(screen.getByText(/Straight-line estimate/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View route" })).toBeNull();
  });

  it("exposes every selected-building action", () => {
    const actions = {
      onDirections: vi.fn(),
      onToggleFavorite: vi.fn(),
      onShare: vi.fn(),
      onOpenGoogleMaps: vi.fn(),
      onShowMap: vi.fn(),
    };
    render(
      <BuildingRail {...props({ mode: "details", selected: iblc, details: { status: "loading" }, ...actions })} />,
    );

    for (const name of ["Directions", "Save", "Share", "Google Maps", "Show on map"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(actions.onDirections).toHaveBeenCalledOnce();
    expect(actions.onToggleFavorite).toHaveBeenCalledWith("IBLC");
    expect(actions.onShare).toHaveBeenCalledOnce();
    expect(actions.onOpenGoogleMaps).toHaveBeenCalledOnce();
    expect(actions.onShowMap).toHaveBeenCalledOnce();
  });
});
