// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downscaleImage } from "./avatar";

const decode = vi.fn<() => Promise<void>>();

beforeEach(() => {
  decode.mockReset().mockResolvedValue();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:avatar");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal(
    "Image",
    class {
      width = 100;
      height = 100;
      decode = decode;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downscaleImage", () => {
  it("propagates canvas export failures and releases the image URL", async () => {
    const error = new DOMException("Tainted canvas", "SecurityError");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
      throw error;
    });

    await expect(downscaleImage(new File(["image"], "avatar.svg"))).rejects.toBe(error);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar");
  });

  it("rejects unreadable images and releases the image URL", async () => {
    decode.mockRejectedValue(new DOMException("Decode failed", "EncodingError"));

    await expect(downscaleImage(new File(["broken"], "avatar.png"))).rejects.toThrow("Could not read that image");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar");
  });
});
