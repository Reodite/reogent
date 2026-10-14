import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": [
      "./data/**/*",
      "./ubc-unified-data/**/*",
      "./.cache/**/*",
      "./.env*",
      "./{.agents,.claude,.kiro,.impeccable,.git,__fixtures__,coverage}/**/*",
      "./{app,src,scripts}/**/*.test.{ts,tsx}",
      "./**/__snapshots__/**/*",
      "./*.md",
    ],
  },
  devIndicators: false,
  poweredByHeader: false,
  redirects: async () => [
    { source: "/chat", destination: "/app", permanent: true },
    {
      source: "/:area(chat|tools|pulse|settings|account|about)/:path*",
      destination: "/app/:area/:path*",
      permanent: true,
    },
  ],
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Content-Security-Policy",
          value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
        },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      ],
    },
  ],
  env: { NEXT_PUBLIC_REOGENT_VERSION: pkg.version },
};

export default nextConfig;
