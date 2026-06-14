"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, EllipsisVertical, Plus, Trash2 } from "lucide-react";
import { usePopover } from "@/components/usePopover";

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
  const [step, setStep] = useState<Step>("root");
  const [pending, start] = useTransition();
  const { open, setOpen, toggle, pos, btnRef, menuRef } = usePopover(step);

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
        onClick={() => {
          if (!open) setStep("root"); // fresh root each open (we never reset on close)
          toggle();
        }}
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
