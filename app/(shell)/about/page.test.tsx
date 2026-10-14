// @vitest-environment happy-dom
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import AboutPage from "./page";

afterEach(cleanup);

it("shows the creator subheading and coffee link in the About workspace", () => {
  const view = render(
    <WorkspaceHostProvider host="about" navigation={<button type="button">Open sidebar</button>}>
      <AboutPage />
    </WorkspaceHostProvider>,
  );

  expect(view.getByRole("heading", { level: 1, name: "About" })).not.toBeNull();
  expect(view.container.querySelector("[data-workspace-header] p")?.textContent).toBe("The creators");
  expect(view.queryByText("The people building Reodite.")).toBeNull();
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

it.each([
  ["Max", "M", "https://libo.dev/ai"],
  ["Chakorn", "C", "https://chakornk.dev"],
])("renders %s in a placeholder picture card with a linked name footer", (name, initial, href) => {
  const view = render(<AboutPage />);
  const card = view.getByRole("article", { name });
  expect(card.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe(initial);

  const link = within(card).getByRole("link", { name, exact: true });
  expect(link.closest("footer")).not.toBeNull();
  expect(link.getAttribute("href")).toBe(href);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
});
