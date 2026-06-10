"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, isActive } from "@/lib/nav";

// Mobile-only tab bar. The admin Users link is intentionally omitted —
// six tabs don't fit at 320px, and user admin lives in the desktop sidebar.
export function BottomBar() {
  const path = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-line bg-panel/90 backdrop-blur-sm sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV_LINKS.map((l) => {
        const active = isActive(l, path);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.62rem] font-semibold tracking-wide transition-colors ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            <l.icon aria-hidden size={20} strokeWidth={2} />
            {l.shortLabel}
          </Link>
        );
      })}
    </nav>
  );
}
