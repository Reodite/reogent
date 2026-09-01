// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "./toast";
import { UploadDropzone } from "./upload-dropzone";

afterEach(cleanup);

describe("UploadDropzone", () => {
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
