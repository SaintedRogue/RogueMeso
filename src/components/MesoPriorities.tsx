"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { MgPriority } from "@prisma/client";
import { updateMesoPriority } from "@/lib/mesoActions";
import { VolumeExplainer } from "@/components/VolumeExplainer";
import { MgDot } from "@/components/ui";
import { mgColor } from "@/lib/format";
import { PRIORITY_META } from "@/lib/priorities";

type Row = { muscleGroupId: number; name: string; priority: MgPriority };

/**
 * Editable volume-priority card on the mesocycle detail page. Changing a group applies
 * immediately (server reconciles upcoming, unstarted days only — past/in-progress work is
 * untouched), mirroring the app's inline useTransition + revalidate idiom.
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
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState<number | null>(null);
  // Local mirror so the select reflects the choice instantly while the server reconciles.
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
    <div className="card mb-6 space-y-3 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Volume priority</div>
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
      <VolumeExplainer weeksCount={weeksCount} />
    </div>
  );
}
