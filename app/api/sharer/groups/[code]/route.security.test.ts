import { expect, it, vi } from "vitest";

const { joinGroup } = vi.hoisted(() => ({ joinGroup: vi.fn(async () => null) }));
vi.mock("@/src/server/auth", () => ({ requireUser: async () => ({ sub: "invitation-probe-user" }) }));
vi.mock("@/src/server/sharer/store", () => ({ CODE_PATTERN: /^[a-zA-Z0-9]{6}$/, joinGroup }));

it("limits invitation guesses per account even when the code changes", async () => {
  const { POST } = await import("./route");
  const request = new Request("http://localhost/api/sharer/groups/abcdef", { method: "POST" });
  for (let index = 0; index < 10; index++) {
    const response = await POST(request, { params: Promise.resolve({ code: `code0${index}` }) });
    expect(response.status).toBe(404);
  }
  const denied = await POST(request, { params: Promise.resolve({ code: "abcdef" }) });
  expect(denied.status).toBe(429);
  expect(joinGroup).toHaveBeenCalledTimes(10);
});
