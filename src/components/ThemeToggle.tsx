"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

// Keep in sync with the inline boot script in src/app/layout.tsx.
const STORAGE_KEY = "theme";
const EVENT = "themechange";

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

// The active theme lives on <html data-theme> (set by the boot script before
// paint). We treat the DOM as an external store via useSyncExternalStore: it
// returns the server snapshot ("dark", the SSR default) during hydration, then
// reconciles to the real client value — the React-blessed way to read a
// client-only value without a setState-in-effect or hydration warning.
function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/** Light/dark switch. Persists an explicit choice and updates browser chrome. */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => "dark");

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable (private mode) — theme still applies this session */
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#f8fafc" : "#0c0a09");
    window.dispatchEvent(new Event(EVENT));
  }

  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      suppressHydrationWarning
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-accent-dim hover:text-text sm:min-h-9"
    >
      {/* Icon and label name the theme you'd switch TO — the common convention. */}
      <span aria-hidden className="grid h-4 w-4 place-items-center" suppressHydrationWarning>
        {isDark ? <SunIcon /> : <MoonIcon />}
      </span>
      <span suppressHydrationWarning>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
