// @vitest-environment happy-dom
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import AboutPage from "./page";

afterEach(cleanup);

it("shows the tagline, creator profiles, and coffee link in the About workspace", () => {
  const view = render(
    <WorkspaceHostProvider host="about" navigation={<button type="button">Open sidebar</button>}>
      <AboutPage />
    </WorkspaceHostProvider>,
  );

  expect(view.getByRole("heading", { level: 1, name: "About" })).not.toBeNull();
  expect(view.getByText("UBC's website and advising sucks.")).not.toBeNull();
  expect(view.getByRole("heading", { level: 2, name: "The people building Reodite." })).not.toBeNull();
  expect(view.getByText("Max")).not.toBeNull();
  expect(view.getByText("Chakorn")).not.toBeNull();
  expect(view.getByRole("button", { name: "Open sidebar" })).not.toBeNull();
  expect(view.container.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-host")).toBe("about");
  expect(view.container.querySelectorAll("[data-workspace-canvas]")).toHaveLength(1);

  const coffee = view.getByRole("link", { name: "Buy us a coffee" });
  expect(coffee.getAttribute("href")).toBe("https://buymeacoffee.com");
  expect(coffee.getAttribute("target")).toBe("_blank");
  expect(coffee.getAttribute("rel")).toBe("noopener noreferrer");
});
