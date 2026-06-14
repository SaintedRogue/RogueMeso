"use client";

// Sidebar footer "What's new" control, sitting just above the username. Mirrors the
// UserMenu popover pattern: a relative wrapper with an upward-flipping card (absolute
// bottom-full) that re-asserts base surface tokens via .user-menu so it reads as a normal
// elevated card over the orange light-mode rail.
//
// The badge appears only when the deployed version has feat/fix commits the user hasn't
// acknowledged; opening the panel marks them seen. A brand-new user (baseline state) is
// silently caught up on mount so they don't see the entire repo history.
import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, ChevronUp, ExternalLink } from "lucide-react";
import { timeAgo } from "@/lib/format";
import { markUpdatesSeen } from "@/lib/updatesActions";
import type { UpdatesState, UpdateItem } from "@/lib/updates";

export function UpdatesPanel({ state }: { state: UpdatesState }) {
  const [open, setOpen] = useState(false);
  // Optimistically clears the badge the moment the panel opens, before the server round-trip.
  const [seen, setSeen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Silently baseline a first-time user so they only ever see changes shipped from now on.
  useEffect(() => {
    if (state.kind === "baseline") startTransition(() => void markUpdatesSeen());
  }, [state.kind]);

  // Close on outside click or Escape — same dismissal contract as UserMenu.
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

  const items = state.kind === "updates" ? state.items : [];
  const hasUpdate = state.kind === "updates" && !seen;

  function toggle() {
    const next = !open;
    setOpen(next);
    // Opening with pending updates marks them seen: clear the badge optimistically and
    // persist in the background. We deliberately do NOT revalidate the layout here — that
    // would re-render the server component as "caught up" and wipe the list the user just
    // opened. The DB write takes effect on the next navigation/reload instead.
    if (next && hasUpdate) {
      setSeen(true);
      startTransition(() => void markUpdatesSeen());
    }
  }

  return (
    <div ref={ref} className="relative">
      {open && (
        <div
          role="dialog"
          aria-label="What's new"
          className="user-menu card absolute bottom-full left-0 right-0 mb-2 overflow-hidden"
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="text-sm font-semibold text-text">What&rsquo;s new</p>
          </div>

          {items.length > 0 ? (
            <div className="max-h-80 overflow-y-auto p-1">
              {items.map((it) => (
                <ChangeRow key={it.sha} item={it} />
              ))}
            </div>
          ) : (
            <p className="px-3 py-4 text-sm text-muted">
              {state.kind === "dev"
                ? "Running a local dev build — update notes appear in deployed versions."
                : "You’re all caught up."}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-panel-2/60"
      >
        <Sparkles aria-hidden size={16} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">What&rsquo;s new</span>
        {hasUpdate && (
          <span
            className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[0.7rem] font-semibold leading-5 text-on-accent"
            aria-label={`${items.length} new ${items.length === 1 ? "update" : "updates"}`}
          >
            {items.length}
          </span>
        )}
        <ChevronUp
          aria-hidden
          size={16}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  );
}

/** One changelog entry: a type chip, optional scope + age, and the summary, linking to the commit. */
function ChangeRow({ item }: { item: UpdateItem }) {
  const isFeat = item.type === "feat";
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="group block rounded-md px-2.5 py-2 transition-colors hover:bg-panel-2"
    >
      <div className="flex items-center gap-2">
        <span
          className={`chip ${isFeat ? "text-good" : "text-info"}`}
          style={{ borderColor: "currentColor" }}
        >
          {isFeat ? "New" : "Fix"}
        </span>
        {item.scope && <span className="truncate text-xs text-muted">{item.scope}</span>}
        {item.date && (
          <span className="ml-auto shrink-0 text-[0.7rem] text-muted/70">{timeAgo(item.date)}</span>
        )}
      </div>
      <p className="mt-1 flex items-start gap-1 text-sm text-text">
        <span className="min-w-0 flex-1">{item.summary}</span>
        <ExternalLink
          aria-hidden
          size={12}
          className="mt-1 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
        />
      </p>
    </a>
  );
}
