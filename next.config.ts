import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

const dev = process.env.NODE_ENV !== "production";

// Pages stay pre-built, so the policy cannot carry per-request nonces and allows the inline scripts
// Next.js emits. Session tokens live in httpOnly cookies that page scripts cannot read.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  // MapLibre basemap style, tiles, sprites and glyphs.
  "connect-src 'self' https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  typescript: {
    tsconfigPath: dev ? "tsconfig.json" : "tsconfig.build.json",
  },
  output: "standalone",
  outputFileTracingExcludes: { "/*": ["./data/**/*", "./ubc-unified-data/**/*", "./.cache/**/*"] },
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
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        // Browsers ignore HSTS over plain HTTP, so local HTTP servers are unaffected.
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    },
  ],
  env: { NEXT_PUBLIC_REOGENT_VERSION: pkg.version },
};

export default nextConfig;
