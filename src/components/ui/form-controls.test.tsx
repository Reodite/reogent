// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox, Field, SearchInput, SelectInput, TextInput } from "./form-controls";

describe("TextInput", () => {
  it("forwards native input events and refs", () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    const { getByRole } = render(
      <TextInput
        ref={ref}
        aria-label="Program"
        aria-invalid="true"
        placeholder="Computer Science"
        onChange={onChange}
      />,
    );
    const input = getByRole("textbox", { name: "Program" });

    fireEvent.change(input, { target: { value: "Computer Science" } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(ref.current).toBe(input);
  });
});

describe("SelectInput", () => {
  it("forwards native select events and refs", () => {
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

  it("keeps label actions outside the label and preserves field error associations", () => {
    const { getByLabelText, getByRole } = render(
      <Field
        label="Program"
        htmlFor="program"
        labelAction={<a href="https://vancouver.calendar.ubc.ca">UBC Calendar</a>}
        error="Choose a program."
      >
        <TextInput id="program" aria-invalid="true" aria-describedby="program-error" />
      </Field>,
    );
    const input = getByLabelText("Program");
    expect(input.getAttribute("aria-describedby")).toBe("program-error");
    expect(getByRole("alert").id).toBe("program-error");
    expect(getByRole("link").closest("label")).toBeNull();
  });

  it("delegates the search clear action", () => {
    const onClear = vi.fn();
    const { getByRole } = render(<SearchInput aria-label="Find courses" value="CPSC" onClear={onClear} />);
    fireEvent.click(getByRole("button", { name: "Clear search" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("forwards native checkbox state through the shared indicator", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<Checkbox label="Show Ada" checked onChange={onChange} />);
    const checkbox = getByRole("checkbox", { name: "Show Ada" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledOnce();
  });
});
