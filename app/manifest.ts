import type { MetadataRoute } from "next";

// Web app manifest: lets students install Reodite to the home screen. Colors
// match the light theme in layout.tsx's viewport; icons are the header logo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reodite — AI for your campus",
    short_name: "Reodite",
    description: "Courses, prerequisites, tuition, and walking routes from real UBC data.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#f7f7f5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
