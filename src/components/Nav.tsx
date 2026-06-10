"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Current workout", icon: "▦" },
  { href: "/mesocycles", label: "Mesocycles", icon: "▤" },
  { href: "/exercises", label: "Exercises", icon: "✦" },
  { href: "/templates", label: "Templates", icon: "❏" },
  { href: "/profile", label: "Profile & Settings", icon: "◍" },
];

const ADMIN_LINK = { href: "/admin/users", label: "Users", icon: "⬡" };

export function Nav({ isAdmin }: { isAdmin?: boolean }) {
  const path = usePathname();
  const links = isAdmin ? [...LINKS, ADMIN_LINK] : LINKS;
  return (
    <nav className="flex flex-col gap-0.5">
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-panel-2 font-semibold text-accent"
                : "text-muted hover:bg-panel-2/60 hover:text-text"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent" />
            )}
            <span className="w-4 text-center opacity-80">{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
