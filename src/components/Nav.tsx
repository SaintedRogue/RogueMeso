"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, ADMIN_LINK, isActive } from "@/lib/nav";

export function Nav({ isAdmin }: { isAdmin?: boolean }) {
  const path = usePathname();
  const links = isAdmin ? [...NAV_LINKS, ADMIN_LINK] : NAV_LINKS;
  return (
    <nav className="flex flex-col gap-0.5">
      {links.map((l) => {
        const active = isActive(l, path);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-panel-2 font-semibold text-accent"
                : "text-muted hover:bg-panel-2/60 hover:text-text"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent" />
            )}
            <span aria-hidden className="w-4 text-center opacity-80">{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
