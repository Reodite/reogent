// @vitest-environment happy-dom
import type { MapHighlight } from "@/src/lib/walking";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MapArea } from "./map-panel";

const shell = vi.hoisted(() => ({ mode: "ai", highlight: null as MapHighlight | null, focusNonce: 0 }));
vi.mock("@/src/components/chat/chat-shell-context", () => ({ useChatShell: () => shell }));
vi.mock("@/src/components/map/campus-map", () => ({ CampusMap: () => <div data-testid="map" /> }));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => ({ status: "signedOut" }) }));
vi.mock("@/src/components/providers", () => ({ useApi: () => ({}) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

afterEach(cleanup);

it("replaces and clears highlight summaries immediately without remounting the map", () => {
  shell.highlight = { kind: "route", from: "IBLC", to: "CHEM", minutes: 5, meters: 400, method: "network" };
  const { container, getByTestId, getByText, queryByText, rerender } = render(<MapArea />);
  const map = getByTestId("map");
  const first = getByText(/IBLC → CHEM/).closest(".neu-panel");
  shell.highlight = { kind: "route", from: "NEST", to: "CHEM", minutes: 3, meters: 240, method: "network" };
  rerender(<MapArea />);
  expect(queryByText(/IBLC → CHEM/)).toBeNull();
  const next = getByText(/NEST → CHEM/).closest(".neu-panel");
  expect(next).not.toBe(first);
  expect(next?.className).toContain("ui-notice-enter");
  shell.highlight = { ...shell.highlight, meters: 250 };
  rerender(<MapArea />);
  expect(getByText(/NEST → CHEM/).closest(".neu-panel")).toBe(next);
  shell.highlight = null;
  rerender(<MapArea />);
  expect(queryByText(/NEST → CHEM/)).toBeNull();
  expect(container.querySelector(".ui-notice-enter")).toBeNull();
  expect(getByTestId("map")).toBe(map);
});
