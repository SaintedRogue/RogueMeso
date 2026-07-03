// Next.js 16 "Proxy" (formerly Middleware). Optimistic single-user route gate:
// redirects unauthenticated requests to /login. Server actions also re-check (auth.ts).
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export async function proxy(req: NextRequest) {
  const authed = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!authed) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Protect everything except the login + first-run setup pages, Next internals,
  // and PWA assets (the manifest is fetched without credentials, so it must stay
  // public). /setup is public so a fresh, user-less deploy isn't locked out; the
  // page and its action both close themselves once any account exists.
  // api/wearables is the Zepp beacon's endpoint: its caller (the mini-app's Side
  // Service inside the Zepp phone app) has no session cookie — the route does its own
  // bearer-token auth + rate limiting, and answers 503 until ZEPP_BEACON_TOKEN is set.
  matcher: [
    "/((?!login|setup|api/wearables|_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-icon.png|icon-192.png|icon-512.png|sw.js).*)",
  ],
};
