// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "./toast";
import { UploadDropzone } from "./upload-dropzone";

afterEach(cleanup);

describe("UploadDropzone", () => {
  it("uses the shared drop area for a labeled replacement action", () => {
    const { container } = render(
      <ToastProvider>
        <UploadDropzone label="Replace my schedule" onParsed={vi.fn()} />
      </ToastProvider>,
    );

    const dropzone = screen.getByRole("button", { name: /Replace my schedule/ });
    expect(dropzone.className).toContain("border-dashed");
    expect(dropzone.className).toContain("min-h-20");
    expect(dropzone.textContent).toContain("Drop a Workday .xlsx file or click to browse.");
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const openPicker = vi.spyOn(input, "click");
    fireEvent.click(dropzone);
    expect(openPicker).toHaveBeenCalledOnce();
  });

  it.each(["picker", "drop"])("parses a Workday export through the %s", async (method) => {
    const onParsed = vi.fn();
    const { container } = render(
      <ToastProvider>
        <UploadDropzone onParsed={onParsed} />
      </ToastProvider>,
    );
    const bytes = readFileSync("src/lib/schedule/examples/View_Student_Registration_Saved_Schedule.xlsx");
    const file = new File([new Uint8Array(bytes)], "schedule.XLSX");
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const dropzone = screen.getByRole("button", { name: /Import Workday schedule/ });
    if (method === "picker") fireEvent.change(input, { target: { files: [file] } });
    else {
      fireEvent.dragOver(dropzone);
      expect(dropzone.className).toContain("bg-accent-subtle");
      fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
      expect(dropzone.className).not.toContain("bg-accent-subtle");
    }
    await waitFor(() => expect(onParsed).toHaveBeenCalledOnce());
    expect(onParsed.mock.calls[0][0].sections.length).toBeGreaterThan(0);
    expect(onParsed.mock.calls[0][1]).toBe(file.name);
    expect(input.value).toBe("");
  });

  it("rejects a dropped non-Excel file without committing an import", async () => {
    const onParsed = vi.fn();
    render(
      <ToastProvider>
        <UploadDropzone onParsed={onParsed} />
      </ToastProvider>,
    );
    const dropzone = screen.getByRole("button", { name: /Import Workday schedule/ });
    fireEvent.drop(dropzone, { dataTransfer: { files: [new File(["text"], "schedule.csv")] } });
    expect(await screen.findByText(/needs to be the .xlsx file/)).toBeTruthy();
    expect(onParsed).not.toHaveBeenCalled();
  });

  it("rejects oversized files before parsing them", async () => {
    const onParsed = vi.fn();
    const { container } = render(
      <ToastProvider>
        <UploadDropzone onParsed={onParsed} />
      </ToastProvider>,
    );
    const file = new File(["xlsx"], "schedule.xlsx");
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("file input not rendered");
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/over 10 MB/)).toBeTruthy();
    expect(onParsed).not.toHaveBeenCalled();
  });
});
