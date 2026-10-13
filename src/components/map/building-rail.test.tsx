// @vitest-environment happy-dom
import type { BuildingDetails, BuildingSummary } from "@/src/lib/api-types";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  sourceStatus: {
    building: source("UBC Buildings"),
    addresses: source("UBC Addresses"),
    rooms: source("UBC Learning Spaces"),
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
  it.each([
    ["details", "Back to all buildings"],
    ["directions", "Back to building details"],
  ] as const)("returns from %s through the named back action", (mode, label) => {
    const onBack = vi.fn();
    render(<BuildingRail {...props({ mode, selected: iblc, onBack })} />);
    const back = screen.getByRole("button", { name: label });
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("retains building actions through detail loading, failure, and retry", () => {
    const railProps = props({ mode: "details", selected: iblc, details: { status: "loading" } });
    const view = render(<BuildingRail {...railProps} />);
    const identity = screen.getByRole("heading", { name: iblc.name });
    const directions = screen.getByRole("button", { name: "Directions" });
    expect(screen.getByRole("status", { name: "Loading building details" })).not.toBeNull();

    view.rerender(<BuildingRail {...railProps} details={{ status: "error" }} />);
    expect(screen.queryByRole("status", { name: "Loading building details" })).toBeNull();
    expect(screen.getByText("Couldn't load building details.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(railProps.onRetryDetails).toHaveBeenCalledOnce();

    view.rerender(<BuildingRail {...railProps} details={{ status: "ready", data: details }} />);
    expect(screen.getByRole("heading", { name: iblc.name })).toBe(identity);
    expect(screen.getByRole("button", { name: "Directions" })).toBe(directions);
    expect(screen.getByText("IBLC 100")).not.toBeNull();
    expect(screen.queryByRole("status", { name: "Loading building details" })).toBeNull();
  });

  it("resets reading position for a different building and preserves it during detail updates", () => {
    const railProps = props({ mode: "details", selected: iblc, details: { status: "ready", data: details } });
    const view = render(<BuildingRail {...railProps} />);
    const body = () => view.container.querySelector<HTMLElement>("[data-workspace-panel-body]")!;
    body().scrollTop = 100;
    view.rerender(<BuildingRail {...railProps} selected={{ ...iblc }} shareStatus="copy" />);
    expect(body().scrollTop).toBe(100);

    const changed = { ...railProps, selected: chem, details: { status: "loading" } as BuildingDetailsState };
    view.rerender(<BuildingRail {...changed} />);
    expect(body().scrollTop).toBe(0);

    body().scrollTop = 50;
    for (const detailState of [
      { status: "error" },
      { status: "loading" },
      {
        status: "ready",
        data: { ...details, code: chem.code, name: chem.name, building: { ...details.building, ...chem } },
      },
    ] as BuildingDetailsState[]) {
      view.rerender(<BuildingRail {...changed} details={detailState} />);
      expect(body().scrollTop).toBe(50);
    }
  });

  it("keeps curated and saved buildings available during favorites loading", () => {
    const railProps = props({ favoriteStatus: "loading", favorites: new Set() });
    const view = render(<BuildingRail {...railProps} />);
    expect(screen.getByRole("status", { name: "Loading saved buildings" })).not.toBeNull();
    expect(screen.getByRole("listbox", { name: "Curated popular buildings" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Search buildings" })).toBeTruthy();

    view.rerender(<BuildingRail {...railProps} favorites={new Set(["CHEM"])} />);
    expect(screen.queryByRole("status", { name: "Loading saved buildings" })).toBeNull();
    expect(screen.getByRole("listbox", { name: "Saved" }).textContent).toContain(chem.name);

    view.rerender(<BuildingRail {...railProps} favoriteStatus="error" />);
    expect(screen.getByRole("alert").textContent).toContain("Saved buildings are unavailable");
    expect(screen.queryByRole("status", { name: "Loading saved buildings" })).toBeNull();
    view.rerender(<BuildingRail {...railProps} favoriteStatus="idle" />);
    expect(screen.queryByRole("heading", { name: "Saved" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps route calculation as action progress beside editable endpoints", () => {
    render(
      <BuildingRail
        {...props({
          mode: "directions",
          selected: iblc,
          routeOrigin: chem,
          route: { status: "loading", from: chem, to: iblc },
        })}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("Finding a walking route…");
    expect(screen.getByRole("combobox", { name: "From building" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "To building" })).toBeTruthy();
  });

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

  it("caps endpoint results and supports Home and End selection", () => {
    const catalog = Array.from({ length: 25 }, (_, index): BuildingSummary => ({
      ...iblc,
      code: `A${String(index).padStart(3, "0")}`,
      name: `Alpha Building ${index}`,
      aliases: [],
    }));
    render(
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
    expect(screen.getAllByRole("option")).toHaveLength(20);
    expect(screen.getByText("20 results")).toBeTruthy();

    fireEvent.keyDown(input, { key: "End" });
    const options = screen.getAllByRole("option");
    expect(input.getAttribute("aria-activedescendant")).toBe(options.at(-1)?.id);
    expect(options.at(-1)?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "Home" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
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
    expect(screen.queryByRole("heading", { name: "Building" })).toBeNull();
    expect(screen.queryByText("LEED Gold")).toBeNull();
    expect(screen.queryByText("FeeSimple")).toBeNull();
    expect(screen.getByText("IBLC 100")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /^Bookable rooms/ })).toBeNull();
    expect(screen.getByText("Library help desk")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /^Entrances/ })).toBeNull();
    expect(screen.queryByText("Primary")).toBeNull();
    expect(screen.queryByText(/Accessibility details/)).toBeNull();
    const sources = screen.getByRole("heading", { name: "Sources" }).parentElement!;
    expect(sources.textContent).toContain("UBC Buildings");
    expect(sources.textContent).toContain("UBC Addresses");
    expect(sources.textContent).toContain("UBC Learning Spaces");
    expect(sources.textContent).toContain("UBC Points of Interest");
    expect(sources.textContent).not.toContain("UBC Entrances");
    const refreshedAt = new Date(details.sourceStatus.building.provenance.refreshedAt!).toLocaleDateString("en-CA", {
      dateStyle: "medium",
    });
    expect(within(sources).getAllByText(refreshedAt)).toHaveLength(4);
  });

  it("links room and service listings to their sources", () => {
    render(
      <BuildingRail {...props({ mode: "details", selected: iblc, details: { status: "ready", data: details } })} />,
    );
    const variants = [
      {
        title: "IBLC 100",
        action: "Details",
        href: details.rooms[0].link,
        summary: "classroom · Floor 1 · 80 seats",
        detail: "Rows · Tables",
      },
      {
        title: "Library help desk",
        action: "Website",
        href: details.pois[0].url,
        summary: "campus services · 9–5",
        detail: "Official address match",
      },
    ];
    for (const variant of variants) {
      const title = screen.getByText(variant.title);
      const item = title.closest("li")!;
      expect(within(item).getByText(variant.summary)).not.toBeNull();
      expect(within(item).getByText(variant.detail)).not.toBeNull();
      const action = within(item).getByRole("link", { name: variant.action });
      expect(action.getAttribute("href")).toBe(variant.href);
      expect(action.getAttribute("target")).toBe("_blank");
      expect(action.getAttribute("rel")).toBe("noreferrer");
    }
  });

  it("omits citations that do not back rendered building data", () => {
    const sparseDetails: BuildingDetails = {
      ...details,
      addresses: [],
      rooms: [],
      pois: [],
      photos: [],
      sourceStatus: {
        ...details.sourceStatus,
        entrances: { ...details.sourceStatus.entrances, state: "unavailable" },
      },
    };
    render(
      <BuildingRail
        {...props({ mode: "details", selected: iblc, details: { status: "ready", data: sparseDetails } })}
      />,
    );

    const sources = screen.getByRole("heading", { name: "Sources" }).parentElement;
    expect(sources?.textContent).toContain("UBC Buildings");
    for (const unusedSource of ["UBC Addresses", "UBC Learning Spaces", "UBC Points of Interest", "UBC Entrances"]) {
      expect(sources?.textContent).not.toContain(unusedSource);
    }
    expect(screen.queryByText(/Some source sections are unavailable/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry unavailable sections" })).toBeNull();
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

    const copy = screen.getByRole("button", { name: "Copy link" });
    fireEvent.click(copy);
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

  it.each(["loading", "saving"] as const)("disables Save while favorites are %s", (favoriteStatus) => {
    const railProps = props({ mode: "details", selected: iblc, favoriteStatus });
    render(<BuildingRail {...railProps} />);
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(railProps.onToggleFavorite).not.toHaveBeenCalled();
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
