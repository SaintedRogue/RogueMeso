import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained .next/standalone server (minimal node_modules) so the
  // production Docker image stays small. The Dockerfile copies that output.
  output: "standalone",
  // The service worker must be served at root scope and never cached, so the browser
  // always picks up a new sw.js (push handler / notification routing) on next load.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
