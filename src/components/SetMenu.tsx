"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, EllipsisVertical, Plus, Trash2 } from "lucide-react";

type Scope = "day" | "meso";
type Step = "root" | "add" | "remove";

/**
 * The per-set ⋮ menu: a small popover that floats over the card (rendered through a portal
 * so the card's `overflow-hidden` can't clip it) holding the structural set actions. Two
 * steps deep — pick Add/Remove, then a day/meso scope — so a destructive change is never a
 * single stray tap. Dismisses on outside-click, Escape, or scroll/resize (a fixed-position
 * popover would otherwise drift away from its anchor).
 */
export function SetMenu({
  setNumber,
  canRemove,
  onAdd,
  onRemove,
}: {
  setNumber: number;
  canRemove: boolean;
  onAdd: (scope: Scope) => void | Promise<void>;
  onRemove: (scope: Scope) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("root");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [pending, start] = useTransition();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position against the trigger once the menu has rendered (so we know its real size).
  // Prefer dropping below; flip above when the row sits too low to fit. Kept hidden until
  // placed, so a mispositioned first frame is never painted.
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
  }, [open, step]);

  // Reset to a clean state whenever the menu closes.
  useEffect(() => {
    if (!open) {
      setPos(null);
      setStep("root");
    }
  }, [open]);

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

  const run = (fn: (scope: Scope) => void | Promise<void>, scope: Scope) =>
    start(async () => {
      await fn(scope);
      setOpen(false);
    });

  const item =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-50";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Set options"
        aria-label={`Options for set ${setNumber}`}
        className="flex min-h-11 min-w-10 items-center justify-center rounded-full text-muted transition-colors hover:text-text sm:min-h-0 sm:min-w-0 sm:px-1 sm:py-1"
      >
        <EllipsisVertical aria-hidden size={16} strokeWidth={2.25} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Set ${setNumber} options`}
            style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
            className="card z-50 w-44 p-1 shadow-xl"
          >
            {step === "root" && (
              <>
                <button role="menuitem" onClick={() => setStep("add")} className={`${item} text-text hover:bg-panel-2`}>
                  <Plus aria-hidden size={16} className="text-muted" /> Add set
                </button>
                {canRemove && (
                  <button
                    role="menuitem"
                    onClick={() => setStep("remove")}
                    className={`${item} text-text hover:bg-panel-2 hover:text-bad`}
                  >
                    <Trash2 aria-hidden size={16} className="text-muted" /> Remove set
                  </button>
                )}
              </>
            )}

            {(step === "add" || step === "remove") && (
              <>
                <div className="flex items-center gap-1 px-1.5 pb-1 pt-0.5 text-xs text-muted">
                  <button onClick={() => setStep("root")} aria-label="Back" className="hover:text-text">
                    <ChevronLeft aria-hidden size={14} />
                  </button>
                  <span>{step === "add" ? "Add set to" : "Remove from"}</span>
                </div>
                {(["day", "meso"] as const).map((scope) => (
                  <button
                    key={scope}
                    role="menuitem"
                    disabled={pending}
                    onClick={() => run(step === "add" ? onAdd : onRemove, scope)}
                    className={`${item} text-text hover:bg-panel-2 ${step === "remove" ? "hover:text-bad" : "hover:text-accent"}`}
                  >
                    {scope === "day" ? "This day" : "Rest of meso"}
                  </button>
                ))}
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
