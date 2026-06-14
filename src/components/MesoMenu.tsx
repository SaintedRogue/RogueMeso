"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronLeft,
  EllipsisVertical,
  Loader2,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { usePopover } from "@/components/usePopover";
import {
  archiveMesocycle,
  deleteMesocycle,
  finishMesocycle,
  renameMesocycle,
  setActiveMesocycle,
  unarchiveMesocycle,
} from "@/lib/mesoActions";

type Step = "root" | "rename" | "finish" | "delete";

/**
 * The per-mesocycle ⋮ menu (list cards + detail header): a portal popover (so a card's
 * `overflow-hidden` can't clip it) holding every block action. Destructive/structural choices
 * are one step deep — Rename opens an inline field, Finish/Delete a confirm — so nothing
 * happens on a single stray tap. Set-active enforces the single-active block; archive/finish
 * bench it. Mirrors SetMenu; shared plumbing lives in usePopover.
 */
export function MesoMenu({
  mesoKey,
  name,
  status,
  isActive,
}: {
  mesoKey: string;
  name: string;
  status: string;
  isActive: boolean;
}) {
  const [step, setStep] = useState<Step>("root");
  const [draft, setDraft] = useState(name);
  const [pending, start] = useTransition();
  const { open, setOpen, toggle, pos, btnRef, menuRef } = usePopover(step);

  const archived = status === "archived";
  const done = status === "complete";

  // Run a server action, then close. Delete redirects (throws control-flow) so it never resolves.
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      setOpen(false);
    });

  const saveRename = () => {
    const clean = draft.trim();
    if (!clean) return;
    run(() => renameMesocycle(mesoKey, clean));
  };

  // Base omits a text color so each item sets its own (matches SetMenu); Delete adds hover:text-bad.
  const item =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-panel-2 disabled:opacity-50";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (!open) {
            setStep("root"); // fresh root + current name each open (we never reset on close)
            setDraft(name);
          }
          toggle();
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Options for ${name}`}
        title="Mesocycle options"
        className="flex min-h-9 min-w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-text"
      >
        <EllipsisVertical aria-hidden size={16} strokeWidth={2.25} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`${name} options`}
            style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
            className="card z-50 w-52 p-1 shadow-xl"
          >
            {step === "root" && (
              <>
                {!isActive && (
                  <button role="menuitem" disabled={pending} onClick={() => run(() => setActiveMesocycle(mesoKey))} className={`${item} text-text`}>
                    <Star aria-hidden size={16} className="text-accent" /> Set as active
                  </button>
                )}
                <button role="menuitem" onClick={() => setStep("rename")} className={`${item} text-text`}>
                  <Pencil aria-hidden size={16} className="text-muted" /> Rename
                </button>
                {!done && !archived && (
                  <button role="menuitem" onClick={() => setStep("finish")} className={`${item} text-text`}>
                    <CheckCircle2 aria-hidden size={16} className="text-muted" /> Finish block
                  </button>
                )}
                <button
                  role="menuitem"
                  disabled={pending}
                  onClick={() => run(() => (archived ? unarchiveMesocycle(mesoKey) : archiveMesocycle(mesoKey)))}
                  className={`${item} text-text`}
                >
                  {archived ? (
                    <>
                      <ArchiveRestore aria-hidden size={16} className="text-muted" /> Unarchive
                    </>
                  ) : (
                    <>
                      <Archive aria-hidden size={16} className="text-muted" /> Archive
                    </>
                  )}
                </button>
                <button role="menuitem" onClick={() => setStep("delete")} className={`${item} text-text hover:text-bad`}>
                  <Trash2 aria-hidden size={16} className="text-muted" /> Delete
                </button>
              </>
            )}

            {step === "rename" && (
              <div className="p-1.5">
                <div className="mb-1.5 flex items-center gap-1 text-xs text-muted">
                  <button onClick={() => setStep("root")} aria-label="Back" className="hover:text-text">
                    <ChevronLeft aria-hidden size={14} />
                  </button>
                  <span>Rename block</span>
                </div>
                <input
                  className="input w-full py-1.5"
                  value={draft}
                  autoFocus
                  maxLength={80}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename();
                    if (e.key === "Escape") setStep("root");
                  }}
                  aria-label="Mesocycle name"
                />
                <button
                  type="button"
                  onClick={saveRename}
                  disabled={pending || !draft.trim()}
                  className="btn-primary mt-2 inline-flex w-full items-center justify-center gap-1.5 py-1.5 text-sm disabled:opacity-60"
                >
                  {pending && <Loader2 aria-hidden size={14} className="animate-spin" />}
                  Save
                </button>
              </div>
            )}

            {step === "finish" && (
              <Confirm
                label="Mark this block complete? It'll leave your active workout."
                cta="Finish block"
                tone="accent"
                pending={pending}
                onBack={() => setStep("root")}
                onConfirm={() => run(() => finishMesocycle(mesoKey))}
              />
            )}

            {step === "delete" && (
              <Confirm
                label="Delete this block and all its logged sets? This can't be undone."
                cta="Delete"
                tone="bad"
                pending={pending}
                onBack={() => setStep("root")}
                onConfirm={() => run(() => deleteMesocycle(mesoKey))}
              />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function Confirm({
  label,
  cta,
  tone,
  pending,
  onBack,
  onConfirm,
}: {
  label: string;
  cta: string;
  tone: "accent" | "bad";
  pending: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const toneCls = tone === "bad" ? "border-bad text-bad hover:bg-bad/10" : "border-accent text-accent hover:bg-accent/10";
  return (
    <div className="p-1.5">
      <div className="mb-1.5 flex items-center gap-1 text-xs text-muted">
        <button onClick={onBack} aria-label="Back" className="hover:text-text">
          <ChevronLeft aria-hidden size={14} />
        </button>
        <span>Confirm</span>
      </div>
      <p className="px-1 pb-2 text-xs text-muted">{label}</p>
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-60 ${toneCls}`}
      >
        {pending && <Loader2 aria-hidden size={14} className="animate-spin" />}
        {cta}
      </button>
    </div>
  );
}
