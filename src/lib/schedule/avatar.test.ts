// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { downscaleImage } from "./avatar";

const decode = vi.fn<() => Promise<void>>();

beforeEach(() => {
  vi.useFakeTimers();
  decode.mockReset().mockResolvedValue();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:avatar");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal(
    "Image",
    class {
      width = 100;
      height = 100;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = decode;
      set src(_value: string) {
        void decode()
          .then(
            () => this.onload?.(),
            () => this.onerror?.(),
          )
          .catch(() => {
            // Load-handler exceptions do not reject image decoding.
          });
      }
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("rejects canvas export failures and releases the image URL", async () => {
  const error = new DOMException("Tainted canvases may not be exported", "SecurityError");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
    throw error;
  });
  const outcome = downscaleImage(new File(["image"], "avatar.svg")).then(
    (value) => ({ value }),
    (failure) => ({ error: failure }),
  );
  const pending = new Promise((resolve) => setTimeout(() => resolve("pending"), 0));
  await vi.runAllTimersAsync();
  expect(await Promise.race([outcome, pending])).toEqual({ error });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar");
});

it("rejects unreadable images and releases the image URL", async () => {
  decode.mockRejectedValue(new DOMException("Decode failed", "EncodingError"));
  await expect(downscaleImage(new File(["broken"], "avatar.png"))).rejects.toThrow("Could not read that image");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar");
});
