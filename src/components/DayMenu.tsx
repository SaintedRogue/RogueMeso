"use client";

import { useTransition } from "react";
import { createPortal } from "react-dom";
import { EllipsisVertical, Loader2, Pencil, Share2 } from "lucide-react";
import { usePopover } from "@/components/usePopover";
import { useShareWorkout } from "@/components/useShareWorkout";
import { toast } from "@/components/Toaster";
import { reopenDay } from "@/lib/actions";

/**
 * The per-day ⋮ menu (day page header). A portal popover (so the header can't clip it) holding
 * day-level actions. "Share workout" renders for any day with exercises — it builds a branded
 * PNG of the session and hands it to the native share sheet (texting a friend), falling back to
 * a download where Web Share isn't available. "Edit session" reopens a finished day so its sets
 * can be corrected, so it's gated behind `done`. Mirrors MesoMenu/SetMenu; shared
 * positioning/dismissal lives in usePopover.
 */
export function DayMenu({
  mesoKey,
  week,
  position,
  done,
}: {
  mesoKey: string;
  week: number;
  position: number;
  done: boolean;
}) {
  const [editing, startEdit] = useTransition();
  const { share, sharing } = useShareWorkout(mesoKey, week, position);
  const { open, setOpen, toggle, pos, btnRef, menuRef } = usePopover();

  // Base item class matches MesoMenu/SetMenu; each item adds its own text color.
  const item =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-panel-2 disabled:opacity-50";

  const onEdit = () =>
    startEdit(async () => {
      try {
        await reopenDay(mesoKey, week, position);
        setOpen(false);
        toast("Session reopened — edit your sets, then complete again.");
      } catch {
        setOpen(false);
        toast("Couldn't reopen the session — try again.", "error");
      }
    });

  const onShare = () => share(() => setOpen(false));

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
            <button role="menuitem" disabled={sharing} onClick={onShare} className={`${item} text-text`}>
              {sharing ? (
                <Loader2 aria-hidden size={16} className="animate-spin text-muted" />
              ) : (
                <Share2 aria-hidden size={16} className="text-muted" />
              )}
              Share workout
            </button>
            {done && (
              <button role="menuitem" disabled={editing} onClick={onEdit} className={`${item} text-text`}>
                {editing ? (
                  <Loader2 aria-hidden size={16} className="animate-spin text-muted" />
                ) : (
                  <Pencil aria-hidden size={16} className="text-muted" />
                )}
                Edit session
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
