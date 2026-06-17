"use client";

import { useTransition } from "react";
import { createPortal } from "react-dom";
import { EllipsisVertical, Loader2, Pencil } from "lucide-react";
import { usePopover } from "@/components/usePopover";
import { toast } from "@/components/Toaster";
import { reopenDay } from "@/lib/actions";

/**
 * The per-day ⋮ menu (day page header). A portal popover (so the header can't clip it) holding
 * day-level actions. Today that's just "Edit session" — reopening a finished day so its sets
 * can be corrected; it's only rendered for completed days. Mirrors MesoMenu/SetMenu; shared
 * positioning/dismissal lives in usePopover.
 */
export function DayMenu({ mesoKey, week, position }: { mesoKey: string; week: number; position: number }) {
  const [pending, start] = useTransition();
  const { open, setOpen, toggle, pos, btnRef, menuRef } = usePopover();

  // Base item class matches MesoMenu/SetMenu; each item adds its own text color.
  const item =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-panel-2 disabled:opacity-50";

  const onEdit = () =>
    start(async () => {
      try {
        await reopenDay(mesoKey, week, position);
        setOpen(false);
        toast("Session reopened — edit your sets, then complete again.");
      } catch {
        setOpen(false);
        toast("Couldn't reopen the session — try again.", "error");
      }
    });

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Day options"
        title="Day options"
        className="flex min-h-9 min-w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-text"
      >
        <EllipsisVertical aria-hidden size={16} strokeWidth={2.25} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Day options"
            style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
            className="card z-50 w-52 p-1 shadow-xl"
          >
            <button role="menuitem" disabled={pending} onClick={onEdit} className={`${item} text-text`}>
              {pending ? (
                <Loader2 aria-hidden size={16} className="animate-spin text-muted" />
              ) : (
                <Pencil aria-hidden size={16} className="text-muted" />
              )}
              Edit session
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
