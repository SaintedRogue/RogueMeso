"use client";

// Desktop sidebar footer: the user's name/role is a button that opens a small
// upward popover menu holding the options pulled off the nav list — Profile &
// Settings, admin Users, and Sign out. The popover re-asserts the base light
// surface tokens (see .user-menu in globals.css) so it reads as a normal
// elevated card rather than inheriting the orange rail's remapped tokens.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronUp, LogOut } from "lucide-react";
import { logout } from "@/lib/authActions";
import { PROFILE_LINK, ADMIN_LINK } from "@/lib/nav";

export function UserMenu({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape — standard popover dismissal.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  const menuLinks = isAdmin ? [PROFILE_LINK, ADMIN_LINK] : [PROFILE_LINK];

  return (
    <div ref={ref} className="relative">
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="user-menu card absolute bottom-full left-0 right-0 mb-2 overflow-hidden p-1"
        >
          {menuLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              role="menuitem"
              onClick={close}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text transition-colors hover:bg-panel-2"
            >
              <l.icon aria-hidden size={16} className="text-muted" />
              {l.label}
            </Link>
          ))}
          <div className="my-1 border-t border-line" />
          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-bad"
            >
              <LogOut aria-hidden size={16} />
              Sign out
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-panel-2/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-[0.7rem] uppercase tracking-wider text-muted/70">
            {isAdmin ? "Admin · self-hosted" : "Self-hosted"}
          </span>
        </span>
        <ChevronUp
          aria-hidden
          size={16}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  );
}
