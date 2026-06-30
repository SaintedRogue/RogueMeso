"use client";

import { useTransition } from "react";
import { createPortal } from "react-dom";
import { EllipsisVertical, Loader2, Pencil, Share2 } from "lucide-react";
import { usePopover } from "@/components/usePopover";
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
  const [sharing, startShare] = useTransition();
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

  const onShare = () =>
    startShare(async () => {
      const name = `roguemeso-week${week + 1}-day${position + 1}.png`;
      try {
        const res = await fetch(`/api/mesocycles/${mesoKey}/${week}/${position}/share-image`);
        if (!res.ok) throw new Error(`image route returned ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], name, { type: "image/png" });
        const text = `My workout — Week ${week + 1}, Day ${position + 1} 💪`;

        // Native share sheet (Messages, WhatsApp, …) when available in a secure context.
        if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: "My workout", text });
            setOpen(false);
            return;
          } catch (err) {
            // The user dismissing the share sheet is not an error.
            if ((err as Error)?.name === "AbortError") {
              setOpen(false);
              return;
            }
            // Any other share failure → fall through to the download path.
          }
        }

        // Fallback: download the PNG so it can be shared manually from Photos/Files.
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
        setOpen(false);
        toast("Saved the image — share it from your photos.");
      } catch {
        setOpen(false);
        toast("Couldn't create the workout image — try again.", "error");
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
