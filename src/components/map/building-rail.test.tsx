// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
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
  ] as const)("keeps the %s back arrow outside the content scroller", (mode, label) => {
    const onBack = vi.fn();
    const { container } = render(<BuildingRail {...props({ mode, selected: iblc, onBack })} />);
    const back = screen.getByRole("button", { name: label });
    expect(back.textContent).toBe("");
    expect(back.getAttribute("title")).toBe(label);
    expect(back.querySelector("svg")?.getAttribute("width")).toBe("20");
    expect(back.querySelector("svg")?.innerHTML).not.toBe("");
    expect(back.className).toContain("sm:size-11");
    expect(back.classList.contains("neu-button")).toBe(false);
    expect(container.querySelector("[data-workspace-panel-body]")?.contains(back)).toBe(false);
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("keeps identity, actions and details in one bounded panel scroller", () => {
    const railProps = props({ mode: "details", selected: iblc, details: { status: "loading" } });
    const view = render(<BuildingRail {...railProps} />);
    const identity = screen.getByRole("heading", { name: iblc.name });
    const directions = screen.getByRole("button", { name: "Directions" });
    const loading = screen.getByRole("status", { name: "Loading building details" });
    const scroller = view.container.querySelector("[data-workspace-panel-body]");
    expect(scroller?.classList.contains("overflow-y-auto")).toBe(true);
    for (const content of [identity, directions, loading]) {
      expect(content.closest(".overflow-y-auto")).toBe(scroller);
    }
    expect(scroller?.contains(screen.getByRole("button", { name: "Back to all buildings" }))).toBe(false);
    expect(loading.parentElement?.className).toContain("px-3 py-4");
    expect(loading.querySelector("[data-skeleton]")?.className).toContain("h-36");
    expect(loading.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(8);
    expect(view.container.querySelector(".animate-pulse")).toBeNull();

    view.rerender(<BuildingRail {...railProps} details={{ status: "error" }} />);
    expect(screen.queryByRole("status", { name: "Loading building details" })).toBeNull();
    expect(screen.getByText("Couldn't load building details.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(railProps.onRetryDetails).toHaveBeenCalledOnce();

    view.rerender(<BuildingRail {...railProps} details={{ status: "ready", data: details }} />);
    expect(screen.getByRole("heading", { name: iblc.name })).toBe(identity);
    expect(screen.getByRole("button", { name: "Directions" })).toBe(directions);
    expect(screen.getByText("IBLC 100").closest(".overflow-y-auto")).toBe(scroller);
    expect(screen.queryByRole("status", { name: "Loading building details" })).toBeNull();
  });

  it("reveals new building identity without resetting same-building updates or remounting the body", () => {
    const railProps = props({ mode: "details", selected: iblc, details: { status: "ready", data: details } });
    const view = render(<BuildingRail {...railProps} />);
    const body = view.container.querySelector<HTMLElement>("[data-workspace-panel-body]")!;
    const identity = screen.getByRole("heading", { name: iblc.name });
    const directions = screen.getByRole("button", { name: "Directions" });
    body.scrollTop = 1619;
    view.rerender(<BuildingRail {...railProps} selected={{ ...iblc }} shareStatus="copy" />);
    expect(body.scrollTop).toBe(1619);

    const changed = { ...railProps, selected: chem, details: { status: "loading" } as BuildingDetailsState };
    view.rerender(<BuildingRail {...changed} />);
    expect(view.container.querySelector("[data-workspace-panel-body]")).toBe(body);
    expect(screen.getByRole("heading", { name: chem.name })).toBe(identity);
    expect(screen.getByRole("button", { name: "Directions" })).toBe(directions);
    expect(body.scrollTop).toBe(0);

    body.scrollTop = 50;
    for (const detailState of [
      { status: "error" },
      { status: "loading" },
      {
        status: "ready",
        data: { ...details, code: chem.code, name: chem.name, building: { ...details.building, ...chem } },
      },
    ] as BuildingDetailsState[]) {
      view.rerender(<BuildingRail {...changed} details={detailState} />);
      expect(body.scrollTop).toBe(50);
    }
    view.rerender(<BuildingRail {...changed} mode="directions" />);
    const routeScroll = view.container.querySelector<HTMLElement>("[data-route-results-scroll]")!;
    routeScroll.scrollTop = 80;
    view.rerender(<BuildingRail {...changed} mode="directions" selected={iblc} />);
    expect(routeScroll.scrollTop).toBe(80);
    view.rerender(<BuildingRail {...railProps} />);
    expect(view.container.querySelector("[data-workspace-panel-body]")).toBe(body);
    expect(body.scrollTop).toBe(0);
  });

  it("insets saved-list skeleton rows once without hiding curated or stale buildings", () => {
    const railProps = props({ favoriteStatus: "loading", favorites: new Set() });
    const view = render(<BuildingRail {...railProps} />);
    const loading = screen.getByRole("status", { name: "Loading saved buildings" });
    expect(loading.className).toContain("p-0");
    expect(loading.className).toContain("px-3");
    expect(loading.querySelectorAll("[data-skeleton]")).toHaveLength(6);
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
    expect(document.querySelector("[data-skeleton]")).toBeNull();
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
    expect(container.querySelector("[data-route-editor]")?.classList.contains("sticky")).toBe(false);
    const styles = readFileSync("app/globals.css", "utf8");
    const scrollRule = styles.match(/\[data-route-results-scroll\]\s*\{([^}]+)\}/)?.[1];
    expect(scrollRule).toContain("overscroll-behavior-y: contain");
    expect(scrollRule).not.toContain("scroll-padding");

    fireEvent.keyDown(input, { key: "End" });
    const options = screen.getAllByRole("option");
    expect(input.getAttribute("aria-activedescendant")).toBe(options.at(-1)?.id);
    expect(options.at(-1)?.getAttribute("aria-selected")).toBe("true");
    expect(options.at(-1)?.className).toContain("rounded-xl");
    expect(options.at(-1)?.className).toContain("neu-inset");
    expect(options.at(-1)?.classList.contains("scroll-mt-36")).toBe(false);
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
    expect(screen.getByRole("button", { name: "Back to all buildings" }).textContent).toBe("");
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

  it("shares list-item anatomy while preserving truncation, wrapping, and action placement", () => {
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
        truncate: true,
        trailing: true,
      },
      {
        title: "Library help desk",
        action: "Website",
        href: details.pois[0].url,
        summary: "campus services · 9–5",
        detail: "Official address match",
        truncate: false,
        trailing: false,
      },
    ];
    for (const variant of variants) {
      const title = screen.getByText(variant.title);
      const item = title.closest("li")!;
      expect(item.parentElement?.tagName).toBe("UL");
      expect(item.className).toBe("bg-surface-container-low rounded-lg p-3");
      expect(title.classList.contains("truncate")).toBe(variant.truncate);
      expect(title.className).toContain("text-sm");
      expect(within(item).getByText(variant.summary).className).toContain("text-xs");
      if (variant.detail) expect(within(item).getByText(variant.detail).className).toContain("text-muted");
      const action = within(item).getByRole("link", { name: variant.action });
      expect(action.parentElement?.classList.contains("flex")).toBe(variant.trailing);
      expect(action.getAttribute("href")).toBe(variant.href);
      expect(action.getAttribute("target")).toBe("_blank");
      expect(action.getAttribute("rel")).toBe("noreferrer");
      expect(action.className).toContain("min-h-11");
      expect(action.className).toContain("sm:min-h-9");
      expect(action.className).toContain("focus-visible:outline-none");
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
    expect(document.querySelector("[data-photo-fallback]")?.className).toContain("h-36");
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
    expect(copy.closest(".overflow-y-auto")).toBe(copy.closest("[data-workspace-panel-body]"));
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
