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
  const { getByTestId, getByText, queryByText, rerender } = render(<MapArea />);
  const map = getByTestId("map");
  shell.highlight = { kind: "route", from: "NEST", to: "CHEM", minutes: 3, meters: 240, method: "network" };
  rerender(<MapArea />);
  expect(queryByText(/IBLC → CHEM/)).toBeNull();
  expect(getByText(/NEST → CHEM/)).toBeTruthy();
  shell.highlight = null;
  rerender(<MapArea />);
  expect(queryByText(/NEST → CHEM/)).toBeNull();
  expect(getByTestId("map")).toBe(map);
});
