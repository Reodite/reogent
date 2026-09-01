// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox, Field, SearchInput, SelectInput, TextInput } from "./form-controls";

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
    expect(input.className).toContain("pr-12");
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

describe("composed form controls", () => {
  it("renders an explicit field label and stable hint association", () => {
    const { getByLabelText, getByText } = render(
      <Field label="Program" htmlFor="program" hint="Used for tuition answers">
        <TextInput id="program" aria-describedby="program-hint" />
      </Field>,
    );
    expect(getByLabelText("Program").getAttribute("aria-describedby")).toBe("program-hint");
    expect(getByText("Used for tuition answers").getAttribute("id")).toBe("program-hint");
  });

  it("supports primary and rail search density with a shared clear action", () => {
    const onClear = vi.fn();
    const { getByRole, rerender } = render(<SearchInput aria-label="Find courses" value="CPSC" onClear={onClear} />);
    let input = getByRole("textbox", { name: "Find courses" });
    expect(input.className).toContain("h-11");
    expect(input.className).not.toContain("sm:h-9");
    fireEvent.click(getByRole("button", { name: "Clear search" }));
    expect(onClear).toHaveBeenCalledOnce();

    rerender(<SearchInput aria-label="Find courses" density="rail" value="" />);
    input = getByRole("textbox", { name: "Find courses" });
    expect(input.className).toContain("sm:h-9");
  });

  it("forwards native checkbox state through the shared indicator", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<Checkbox label="Show Ada" checked onChange={onChange} />);
    const checkbox = getByRole("checkbox", { name: "Show Ada" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledOnce();
    expect(checkbox.nextElementSibling?.className).toContain("peer-checked:bg-primary");
  });
});
