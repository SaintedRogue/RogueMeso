import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RogueMeso",
    short_name: "RogueMeso",
    description: "Self-hosted hypertrophy training",
    start_url: "/",
    display: "standalone",
    // PWA manifest colors are a single static value by spec (used for the install
    // splash / app shell), so they can't follow the live light/dark toggle. We pin
    // them to the default-dark baseline; the runtime <meta name="theme-color"> IS
    // theme-aware (see layout.tsx viewport + ThemeToggle).
    background_color: "#0c0a09",
    theme_color: "#0c0a09",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
