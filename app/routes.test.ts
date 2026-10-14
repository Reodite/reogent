import nextConfig from "@/next.config";
import { getRedirectUrl, unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("public and app routes", () => {
  it.each([
    ["/chat", "/app"],
    ["/chat/session-123", "/app/chat/session-123"],
    ["/tools", "/app/tools"],
    ["/tools/map?building=IBLC", "/app/tools/map?building=IBLC"],
    ["/tools/courses/CPSC110", "/app/tools/courses/CPSC110"],
    ["/pulse", "/app/pulse"],
    ["/pulse/schedule/ABC123", "/app/pulse/schedule/ABC123"],
    ["/pulse/announcements/welcome", "/app/pulse/announcements/welcome"],
    ["/settings", "/app/settings"],
    ["/account", "/app/account"],
    ["/about", "/app/about"],
  ])("redirects %s to %s", async (from, to) => {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://reodite.example${from}`,
      nextConfig,
    });
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe(`https://reodite.example${to}`);
  });

  it.each(["/", "/app", "/app/tools/map", "/login", "/signup", "/onboarding", "/api/chat", "/toolshed"])(
    "leaves %s outside legacy redirects",
    async (pathname) => {
      const response = await unstable_getResponseFromNextConfig({
        url: `https://reodite.example${pathname}`,
        nextConfig,
      });
      expect(getRedirectUrl(response)).toBeNull();
    },
  );

  it("starts installed apps at /app while retaining their identity", () => {
    expect(manifest()).toMatchObject({ id: "/", start_url: "/app" });
  });
});
