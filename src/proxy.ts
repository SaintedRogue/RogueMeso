// Next.js 16 "Proxy" (formerly Middleware). Optimistic single-user route gate:
// redirects unauthenticated requests to /login. Server actions also re-check (auth.ts).
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export async function proxy(req: NextRequest) {
  const authed = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.AUTH_SECRET ?? "");
  if (!authed) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Protect everything except the login page and Next internals.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
