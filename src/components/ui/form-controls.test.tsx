// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { SelectInput, TextInput } from "./form-controls";

describe("TextInput", () => {
  it("renders the shared inset field with native props", () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    const { getByRole } = render(
      <TextInput
        ref={ref}
        aria-label="Program"
        aria-invalid="true"
        placeholder="Computer Science"
        className="max-w-80"
        onChange={onChange}
      />,
    );
    const input = getByRole("textbox", { name: "Program" });

    fireEvent.change(input, { target: { value: "Computer Science" } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(ref.current).toBe(input);
    expect(input.className).toContain("neu-inset");
    expect(input.className).toContain("neu-shadow-on-surface");
    expect(input.className).toContain("h-11");
    expect(input.className).toContain("aria-[invalid=true]:ring-2");
    expect(input.className).toContain("max-w-80");
  });

  it("supports compact geometry, adornments, and another parent material", () => {
    const { getByRole } = render(
      <TextInput aria-label="Search" controlSize="compact" adornment="both" shadowOn="surface-container-low" />,
    );
    const input = getByRole("textbox", { name: "Search" });

    expect(input.className).toContain("h-11");
    expect(input.className).toContain("sm:h-9");
    expect(input.className).toContain("pr-9");
    expect(input.className).toContain("pl-9");
    expect(input.className).not.toContain("px-2.5");
    expect(input.className).toContain("neu-shadow-on-surface-container-low");
  });
});

describe("SelectInput", () => {
  it("renders native options with the same field treatment", () => {
    const ref = createRef<HTMLSelectElement>();
    const onChange = vi.fn();
    const { getByRole } = render(
      <SelectInput ref={ref} aria-label="Year level" defaultValue="2" onChange={onChange}>
        <option value="1">Year 1</option>
        <option value="2">Year 2</option>
      </SelectInput>,
    );
    const select = getByRole("combobox", { name: "Year level" });

    fireEvent.change(select, { target: { value: "1" } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(ref.current).toBe(select);
    expect(select.className).toContain("neu-inset");
    expect(select.className).toContain("h-11");
    expect(select.className).toContain("rounded-lg");
  });

  it("supports compact desktop density", () => {
    const { getByRole } = render(
      <SelectInput aria-label="Session" controlSize="compact" width="auto">
        <option>Winter</option>
      </SelectInput>,
    );
    const select = getByRole("combobox");
    expect(select.className).toContain("sm:h-9");
    expect(select.className).toContain("px-2.5");
    expect(select.className).toContain("text-xs");
    expect(select.className).toContain("w-auto");
    expect(select.className).not.toContain("w-full");
  });
});
