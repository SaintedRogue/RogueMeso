"use client";

import { useEffect } from "react";

/**
 * Records the device's timezone offset in a cookie so server components can reason about the
 * user's *local* calendar day (e.g. "was this session finished today?"). Writes only when the
 * value changed, to avoid needless churn. Renders nothing. Server reads default to the server's
 * own offset until this first lands — self-correcting on the next navigation.
 */
export function TimezoneCookie() {
  useEffect(() => {
    const offset = String(new Date().getTimezoneOffset());
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith("tzoffset="))
      ?.slice("tzoffset=".length);
    if (current !== offset) {
      document.cookie = `tzoffset=${offset}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);
  return null;
}
