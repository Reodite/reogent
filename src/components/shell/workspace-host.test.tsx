// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWorkspaceHost, WorkspaceHostProvider } from "./workspace-host";

function CaptureHost() {
  const value = useWorkspaceHost();
  return (
    <output
      data-testid="host"
      data-host={value.host}
      data-menu-clearance={String(value.menuClearance)}
      data-has-outlet={String(value.titlebarOutlet !== null)}
    />
  );
}

describe("WorkspaceHostProvider", () => {
  it("defaults standalone consumers to the Tools host contract", () => {
    render(<CaptureHost />);
    const host = screen.getByTestId("host");
    expect(host.dataset.host).toBe("tools");
    expect(host.dataset.menuClearance).toBe("true");
    expect(host.dataset.hasOutlet).toBe("false");
  });

  it("supplies an Answer Canvas outlet without DOM discovery", () => {
    const outlet = document.createElement("div");
    render(
      <WorkspaceHostProvider host="answer-canvas" menuClearance={false} titlebarOutlet={outlet}>
        <CaptureHost />
      </WorkspaceHostProvider>,
    );
    const host = screen.getByTestId("host");
    expect(host.dataset.host).toBe("answer-canvas");
    expect(host.dataset.menuClearance).toBe("false");
    expect(host.dataset.hasOutlet).toBe("true");
  });
});
