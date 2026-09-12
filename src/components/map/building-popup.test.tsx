// @vitest-environment happy-dom
import type { BuildingDetails } from "@/src/lib/api-types";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuildingPopup, type SelectedBuilding } from "./building-popup";

const api = vi.hoisted(() => ({ getBuildingDetails: vi.fn() }));
vi.mock("@/src/components/providers", () => ({ useApi: () => api }));

const building: SelectedBuilding = {
  code: "IBLC",
  name: "Irving K. Barber Learning Centre",
  usage: "Academic",
  floors: 5,
  address: "1961 East Mall",
  centroid: [-123.252, 49.267],
};
const emptyContent: Pick<BuildingDetails, "rooms" | "pois"> = {
  rooms: [],
  pois: [],
};

beforeEach(() => {
  api.getBuildingDetails.mockReset().mockReturnValue(new Promise(() => {}));
});
afterEach(cleanup);

describe("BuildingPopup loading", () => {
  it("matches carousel geometry without replacing the fixed building header or close action", async () => {
    const roomUrl = "https://learningspaces.ubc.ca/classrooms/iblc-100";
    const serviceUrl = "https://learningcommons.ubc.ca";
    let resolveDetails: (details: typeof emptyContent) => void = () => {};
    api.getBuildingDetails.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDetails = resolve;
      }),
    );
    const onClose = vi.fn();
    const { container } = render(<BuildingPopup building={building} onClose={onClose} />);
    const identity = screen.getByRole("heading", { name: building.name });
    const popup = screen.getByRole("dialog", { name: `${building.name} details` });
    expect(popup.classList.contains("w-80")).toBe(true);
    expect(popup.classList.contains("max-w-[calc(100%-5rem)]")).toBe(true);
    const close = screen.getByRole("button", { name: "Close building details" });
    const loading = screen.getByRole("status", { name: "Loading building details" });
    expect(loading.parentElement?.className).toContain("px-3.5 py-3");
    expect(loading.className).toContain("border-t pt-3");
    expect(loading.className).toContain("first:border-t-0 first:pt-0");
    expect(loading.querySelectorAll("[data-skeleton]")).toHaveLength(7);
    expect(loading.querySelector(".h-32")).toBeTruthy();
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.queryByText("No room or service listings for this building.")).toBeNull();
    expect(document.activeElement).toBe(close);

    await act(async () =>
      resolveDetails({
        ...emptyContent,
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
            link: roomUrl,
          },
        ],
        pois: [
          {
            name: "Library help desk",
            service_type: "campus_services",
            url: serviceUrl,
            photo: null,
            hours: "9–5",
            contact: null,
            association: "official-address",
          },
        ],
      }),
    );
    expect(screen.queryByRole("status", { name: "Loading building details" })).toBeNull();
    expect(screen.getByText("IBLC 100").closest("div")?.classList.contains("gap-1")).toBe(true);
    expect(screen.getByRole("heading", { name: "Rooms (1)" }).parentElement?.className).toContain(
      "first:border-t-0 first:pt-0",
    );
    expect(screen.getByRole("button", { name: "Previous rooms" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous services" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Study rooms" })).toBeNull();
    expect(screen.queryByText("No room or service listings for this building.")).toBeNull();
    for (const [link, href] of [
      [screen.getByRole("link", { name: /IBLC 100/ }), roomUrl],
      [screen.getByRole("link", { name: /Library help desk/ }), serviceUrl],
    ] as const) {
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noreferrer");
      const image = link.querySelector("img")!;
      expect(image.getAttribute("src")).toBe(`/api/preview?url=${encodeURIComponent(href)}`);
      fireEvent.error(image);
      expect(link.querySelector("img")).toBeNull();
      expect(link.querySelector(".h-32")).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: building.name })).toBe(identity);
    expect(screen.getByRole("button", { name: "Close building details" })).toBe(close);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("replaces loading with retry on failure and shows empty content only after success", async () => {
    api.getBuildingDetails.mockRejectedValueOnce(new Error("offline"));
    const view = render(<BuildingPopup building={building} onClose={vi.fn()} />);
    expect(await screen.findByText("Couldn't load details for this building.")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading building details" })).toBeNull();
    expect(screen.queryByText("No room or service listings for this building.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("status", { name: "Loading building details" })).toBeTruthy();
    expect(api.getBuildingDetails).toHaveBeenCalledTimes(2);
    const pendingSignal = api.getBuildingDetails.mock.calls[1][1] as AbortSignal;

    api.getBuildingDetails.mockResolvedValueOnce(emptyContent);
    view.rerender(
      <BuildingPopup building={{ ...building, code: "CHEM", name: "Chemistry Building" }} onClose={vi.fn()} />,
    );
    expect(pendingSignal.aborted).toBe(true);
    expect(await screen.findByText("No room or service listings for this building.")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading building details" })).toBeNull();
  });
});
