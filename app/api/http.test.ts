import { afterEach, describe, expect, it, vi } from "vitest";
import { readJson, requireJson } from "./http";

const encoder = new TextEncoder();
function request(body?: string | ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("requireJson", () => {
  it.each([
    "application/json",
    "Application/JSON",
    "application/json; charset=utf-8",
    " APPLICATION/JSON ; charset=UTF-8 ",
  ])("accepts %s", (contentType) => {
    expect(requireJson(request("{}", { "content-type": contentType }))).toBeNull();
  });

  it.each([
    "",
    "text/plain",
    "text/plain;application/json",
    "application/jsonp",
    "application/json+extra",
    "application/json, text/plain",
  ])("rejects %s", (contentType) => {
    expect(requireJson(request("{}", { "content-type": contentType }))?.status).toBe(415);
  });
});

describe("readJson", () => {
  it("decodes UTF-8 characters split across chunks at the exact byte ceiling", async () => {
    const bytes = encoder.encode(JSON.stringify({ text: "é🙂" }));
    let offset = 0;
    const input = request(
      new ReadableStream({
        pull(controller) {
          if (offset < bytes.length) controller.enqueue(bytes.slice(offset, ++offset));
          else controller.close();
        },
      }),
    );
    expect(await readJson(input, bytes.length)).toEqual({ body: { text: "é🙂" } });
    expect(input.body?.locked).toBe(false);
  });

  it("uses a 4096-byte default and rejects the next byte", async () => {
    expect(await readJson(request(JSON.stringify("x".repeat(4094))))).toEqual({ body: "x".repeat(4094) });
    const result = await readJson(request(JSON.stringify("x".repeat(4095))));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
  });

  it.each([undefined, "1"])("counts real bytes with Content-Length %s", async (length) => {
    const input = request(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('"éé"'));
          controller.close();
        },
      }),
      length ? { "content-length": length } : {},
    );
    expect(((await readJson(input, 5)) as Response).status).toBe(413);
  });

  it.each(["hang", "reject"])("rejects cumulative overflow before EOF despite %s cancellation", async (cleanup) => {
    const cancel = vi.fn(() =>
      cleanup === "hang" ? new Promise<void>(() => {}) : Promise.reject(new Error("cleanup failed")),
    );
    let pulls = 0;
    const input = request(
      new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pulls++;
            controller.enqueue(encoder.encode("xxxx"));
          },
          cancel,
        },
        { highWaterMark: 0 },
      ),
    );
    const result = await readJson(input, 8);
    expect((result as Response).status).toBe(413);
    expect(pulls).toBe(3);
    expect(cancel).toHaveBeenCalledOnce();
    expect(input.body?.locked).toBe(false);
  });

  it("rejects an oversized first chunk without decoding or parsing it", async () => {
    const decode = vi.spyOn(TextDecoder.prototype, "decode");
    const cancel = vi.fn();
    const input = request(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("x".repeat(4097)));
        },
        cancel,
      }),
    );
    expect(((await readJson(input)) as Response).status).toBe(413);
    expect(decode).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([undefined, "", " ", "{", "not json"])("returns 400 for invalid or absent JSON: %s", async (body) => {
    expect(((await readJson(request(body))) as Response).status).toBe(400);
  });

  it.each([null, [], true, 42])("leaves shape validation to the route: %s", async (body) => {
    expect(await readJson(request(JSON.stringify(body)))).toEqual({ body });
  });

  it("returns 400 on a read failure and releases the reader", async () => {
    let pulls = 0;
    const input = request(
      new ReadableStream({
        pull(controller) {
          if (pulls++ === 0) controller.enqueue(encoder.encode('{"text":'));
          else controller.error(new Error("connection lost"));
        },
      }),
    );
    expect(((await readJson(input)) as Response).status).toBe(400);
    expect(input.body?.locked).toBe(false);
  });

  it("does not treat a transport error as an HTTP response", async () => {
    const input = request(
      new ReadableStream({
        start(controller) {
          controller.error(new Response(null, { status: 500 }));
        },
      }),
    );
    expect(((await readJson(input)) as Response).status).toBe(400);
  });

  it("returns 400 when another reader holds the body", async () => {
    const input = request("{}");
    const reader = input.body!.getReader();
    expect(((await readJson(input)) as Response).status).toBe(400);
    reader.releaseLock();
  });

  it("clears the deadline after a successful read", async () => {
    vi.useFakeTimers();
    expect(await readJson(request("{}"))).toEqual({ body: {} });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])("enforces a fixed deadline with trickling=%s and stalled cancellation", async (trickling) => {
    vi.useFakeTimers();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const input = request(
      new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
        cancel,
      }),
    );
    let response: Awaited<ReturnType<typeof readJson>> | undefined;
    const pending = readJson(input).then((value) => {
      response = value;
    });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(response).toBeUndefined();
    if (trickling) controller.enqueue(encoder.encode("{"));
    await vi.advanceTimersByTimeAsync(999);
    expect(response).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect((response as Response).status).toBe(408);
    expect(cancel).toHaveBeenCalledOnce();
    expect(input.body?.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
