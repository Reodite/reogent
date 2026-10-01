import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: { "/*": ["./data/**/*", "./ubc-unified-data/**/*", "./.cache/**/*"] },
  devIndicators: false,
  poweredByHeader: false,
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
