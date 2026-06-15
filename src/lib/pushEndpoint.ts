// Validates a browser-supplied Web Push endpoint before the server is willing to POST to it.
// Push endpoints are attacker-controllable URLs that our server fetches (in pushActions and the
// in-process scheduler), so an unvalidated endpoint is an SSRF channel — a user could point it
// at internal services or the cloud metadata IP. Real endpoints are public https hosts on the
// big push services, so requiring https + rejecting private/loopback hosts costs nothing.
//
// LIMITATION: this blocks IP-literal and localhost targets, NOT a public hostname that resolves
// to a private address (DNS rebinding). web-push exposes no resolve hook to pin that, so it's an
// accepted residual risk for this self-hosted, authenticated-only feature.

export type EndpointCheck = { ok: true } | { ok: false; reason: string };

// IPv4 literals that must never be a push target.
const PRIVATE_V4 = [
  /^0\./, // "this host"
  /^10\./, // private
  /^127\./, // loopback
  /^169\.254\./, // link-local (incl. 169.254.169.254 cloud metadata)
  /^192\.168\./, // private
  /^172\.(1[6-9]|2\d|3[01])\./, // private 172.16–172.31
];

export function validatePushEndpoint(raw: string): EndpointCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "must be https" };

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (host === "localhost" || host.endsWith(".localhost")) return { ok: false, reason: "loopback host" };

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (PRIVATE_V4.some((re) => re.test(host))) return { ok: false, reason: "private/loopback IPv4" };
  }

  // IPv6 literals only (a colon means it's an address, not a hostname like "fcm.googleapis.com"):
  // loopback (::1), link-local (fe80::/10) and unique-local (fc00::/7 → fc/fd prefix).
  if (host.includes(":")) {
    if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
      return { ok: false, reason: "private/loopback IPv6" };
    }
  }

  return { ok: true };
}
