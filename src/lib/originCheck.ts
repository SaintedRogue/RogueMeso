// Same-origin check for state-changing route handlers. Server Actions get Next's built-in
// origin enforcement, but a hand-written Route Handler (e.g. /api/push/action) does not, so we
// add an explicit check here. Pure (takes header strings) so it's unit-tested without a request.
//
// This is defense-in-depth on top of the SameSite=Lax session cookie, which already blocks the
// cookie from riding along on a cross-site POST. We compare the Origin host (or Referer host as
// a fallback) to the request's Host; a state-changing POST with neither header is rejected.

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export function isSameOrigin(origin: string | null, referer: string | null, host: string | null): boolean {
  if (!host) return false;
  const source = hostOf(origin) ?? hostOf(referer);
  if (!source) return false; // no Origin and no usable Referer on a POST → reject
  return source === host;
}
