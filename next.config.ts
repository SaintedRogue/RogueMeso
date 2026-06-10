import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained .next/standalone server (minimal node_modules) so the
  // production Docker image stays small. The Dockerfile copies that output.
  output: "standalone",
};

export default nextConfig;
