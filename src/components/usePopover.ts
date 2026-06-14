"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Anchored popover plumbing shared by the ⋮ menus (SetMenu, MesoMenu). Renders the menu through
 * a portal at a fixed position so a card's `overflow-hidden` can't clip it: prefers dropping
 * below the trigger, flips above when the row sits too low to fit, and stays hidden until placed
 * so a mispositioned first frame is never painted. Dismisses on outside-click, Escape, or
 * scroll/resize (a fixed-position popover would otherwise drift away from its anchor).
 *
 * `contentKey` should change whenever the menu's size can change (e.g. a multi-step menu's step),
 * so the position is recomputed against the new height.
 */
export function usePopover(contentKey?: unknown) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Toggle from the trigger. Clearing pos on the way in re-arms "hidden until measured", so a
  // re-open never flashes at the previous anchor before the position effect runs. (Done here in
  // an event handler, not a close-effect, to avoid a setState-in-effect cascade.)
  const toggle = useCallback(() => {
    setPos(null);
    setOpen((o) => !o);
  }, []);

  // Position against the trigger once the menu has rendered (so we know its real size).
  useEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const r = btn.getBoundingClientRect();
    const mh = menu.offsetHeight;
    const mw = menu.offsetWidth;
    const margin = 6;
    const below = window.innerHeight - r.bottom;
    const placeAbove = below < mh + margin && r.top > below;
    const top = placeAbove ? Math.max(8, r.top - mh - margin) : r.bottom + margin;
    const left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8));
    setPos({ top, left });
  }, [open, contentKey]);

  // Standard popover dismissal, plus scroll/resize (the portal is position:fixed).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onShift = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onShift, true);
    window.addEventListener("resize", onShift);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onShift, true);
      window.removeEventListener("resize", onShift);
    };
  }, [open]);

  return { open, setOpen, toggle, pos, btnRef, menuRef };
}
