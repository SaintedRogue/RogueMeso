"use client";

import { useState, useTransition } from "react";
import { ChevronUp, Loader2, SlidersHorizontal } from "lucide-react";
import type { MgPriority } from "@prisma/client";
import { updateMesoPriority } from "@/lib/mesoActions";
import { VolumeExplainer } from "@/components/VolumeExplainer";
import { MgDot } from "@/components/ui";
import { mgColor } from "@/lib/format";
import { PRIORITY_META } from "@/lib/priorities";

type Row = { muscleGroupId: number; name: string; priority: MgPriority };

const LABEL: Record<MgPriority, string> = Object.fromEntries(
  PRIORITY_META.map((o) => [o.value, o.label]),
) as Record<MgPriority, string>;

/**
 * Volume-priority control on the mesocycle detail page. Collapsed by default to a single compact
 * summary row (chips of each group's current setting) so it stays out of the way; the ⋯ edit
 * toggle drops down the full editing pane with the "How volume works" explainer open. Each change
 * applies immediately — the server reconciles upcoming, unstarted days only (past/in-progress
 * work is untouched) — mirroring the app's inline useTransition + revalidate idiom.
 */
export function MesoPriorities({
  mesoKey,
  weeksCount,
  priorities,
}: {
  mesoKey: string;
  weeksCount: number;
  priorities: Row[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState<number | null>(null);
  // Local mirror so both the summary chips and the select reflect the choice instantly.
  const [values, setValues] = useState<Record<number, MgPriority>>(
    () => Object.fromEntries(priorities.map((p) => [p.muscleGroupId, p.priority])),
  );

  const change = (muscleGroupId: number, priority: MgPriority) => {
    setValues((v) => ({ ...v, [muscleGroupId]: priority }));
    setSavingId(muscleGroupId);
    start(async () => {
      await updateMesoPriority(mesoKey, muscleGroupId, priority);
      setSavingId(null);
    });
  };

  return (
    <div className="card mb-6 p-3">
      {/* Compact summary: label + current settings as chips + edit toggle. */}
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">Volume</span>
        <div className="flex flex-1 flex-wrap gap-1.5">
          {priorities.map((p) => (
            <span key={p.muscleGroupId} className="chip text-xs" style={{ borderColor: mgColor(p.name) }}>
              <MgDot color={mgColor(p.name)} />
              {p.name} · {LABEL[values[p.muscleGroupId]]}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Close volume editor" : "Edit volume priorities"}
          className="shrink-0 rounded-md p-1.5 text-muted hover:text-text"
        >
          {open ? <ChevronUp aria-hidden size={16} /> : <SlidersHorizontal aria-hidden size={16} />}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-line/60 pt-3">
          <div className="space-y-2">
            {priorities.map((p) => (
              <div key={p.muscleGroupId} className="flex items-center gap-3">
                <MgDot color={mgColor(p.name)} />
                <span className="flex-1 text-sm" style={{ color: mgColor(p.name) }}>
                  {p.name}
                </span>
                {savingId === p.muscleGroupId && pending && (
                  <Loader2 aria-hidden size={14} className="animate-spin text-muted" />
                )}
                <select
                  className="input py-1.5 sm:max-w-[10rem]"
                  value={values[p.muscleGroupId]}
                  onChange={(e) => change(p.muscleGroupId, e.target.value as MgPriority)}
                  disabled={pending}
                  aria-label={`${p.name} priority`}
                >
                  {PRIORITY_META.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">Changes apply to upcoming, unstarted days — logged work is left as-is.</p>
          <VolumeExplainer weeksCount={weeksCount} defaultOpen />
        </div>
      )}
    </div>
  );
}
