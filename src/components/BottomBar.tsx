"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, MORE_LINK, isActive } from "@/lib/nav";

// Mobile-only tab bar, capped at 5 tabs (Workout / Mesos / Exercises / Insights /
// More). The 5th slot is the More hub: every secondary destination (Templates, Body
// Tuning, Recovery, Community, ADHD Mode) plus Profile & Settings and admin live there
// as first-class cards — a 6th/7th tab would shrink slots below a comfortable 44px
// target with a legible label at 320–375px.
export function BottomBar() {
  const path = usePathname();
  const links = [...NAV_LINKS.filter((l) => !l.secondary && !l.inUserMenu), MORE_LINK];
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-line bg-panel/90 backdrop-blur-sm sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {links.map((l) => {
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
