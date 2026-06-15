import type { NextConfig } from "next";

// Baseline security headers applied to every response. CSP notes:
//  - script-src uses 'unsafe-inline' rather than a hash/nonce because Next's App Router emits
//    several per-page inline hydration scripts (self.__next_f.push(...)) whose content varies
//    by page — a static hash can't cover them, and adding a nonce requires per-request wiring
//    through the proxy. 'self' 'unsafe-inline' still blocks loading external script ORIGINS,
//    which is the main XSS win here; a nonce-based CSP is a possible future hardening.
//  - style-src needs 'unsafe-inline' for next/font's injected <style> and recharts' inline SVG
//    styles. next/font self-hosts its files, so font-src 'self' suffices (no Google domains).
//  - HSTS is intentionally omitted: RogueMeso may be served over plain HTTP on a LAN, and an
//    HSTS header there would wrongly force HTTPS. Add it at the TLS-terminating proxy instead.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Emit a self-contained .next/standalone server (minimal node_modules) so the
  // production Docker image stays small. The Dockerfile copies that output.
  output: "standalone",
  async headers() {
    return [
      // Baseline hardening on everything.
      { source: "/:path*", headers: securityHeaders },
      // The service worker must be served at root scope and never cached, so the browser
      // always picks up a new sw.js (push handler / notification routing) on next load.
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
