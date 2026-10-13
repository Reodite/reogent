// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShellBootLoading, WorkspaceRouteLoading } from "./shell-loading";
import { WorkspaceHostProvider } from "./workspace-host";

afterEach(cleanup);

describe("shell loading surfaces", () => {
  it("keeps loading placeholders non-interactive", () => {
    const { queryByRole, rerender } = render(
      <WorkspaceHostProvider host="tools">
        <WorkspaceRouteLoading composition="split" controls />
      </WorkspaceHostProvider>,
    );
    expect(queryByRole("button")).toBeNull();
    rerender(
      <WorkspaceHostProvider host="answer-canvas">
        <WorkspaceRouteLoading composition="split" controls />
      </WorkspaceHostProvider>,
    );
    expect(queryByRole("button")).toBeNull();
  });

  it("exposes one shell main and hides placeholder navigation from assistive technology", () => {
    const { container, getAllByRole } = render(<ShellBootLoading />);
    expect(getAllByRole("main")).toHaveLength(1);
    expect(container.querySelector("[data-mobile-navigation]")?.getAttribute("aria-hidden")).toBe("true");
  });
});
