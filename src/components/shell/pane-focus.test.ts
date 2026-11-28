// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { rememberPaneTrigger, restorePaneTrigger } from "./pane-focus";

afterEach(() => {
  document.body.replaceChildren();
});

describe("pane trigger focus restoration", () => {
  it("restores focus to the connected trigger when the matching pane mounts", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    rememberPaneTrigger("calendar", trigger);

    restorePaneTrigger("calendar");

    expect(document.activeElement).toBe(trigger);
  });

  it("does not restore focus for a different pane", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    rememberPaneTrigger("calendar", trigger);

    restorePaneTrigger("map");

    expect(document.activeElement).toBe(document.body);
  });

  it("does not focus a disconnected trigger or steal focus from another control", () => {
    const disconnected = document.createElement("button");
    rememberPaneTrigger("calendar", disconnected);
    restorePaneTrigger("calendar");
    expect(document.activeElement).toBe(document.body);

    const trigger = document.createElement("button");
    const other = document.createElement("button");
    document.body.append(trigger, other);
    rememberPaneTrigger("calendar", trigger);
    other.focus();

    restorePaneTrigger("calendar");

    expect(document.activeElement).toBe(other);
  });
});
