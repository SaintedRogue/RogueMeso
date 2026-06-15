"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import type { MgPriority } from "@prisma/client";
import { MgDot } from "@/components/ui";
import { mgColor } from "@/lib/format";
import { TemplateSlotPicker, type BuilderSlot } from "@/components/TemplateSlotPicker";
import {
  createTemplateAction,
  updateTemplateAction,
  type TemplateBuilderInput,
} from "@/lib/templateActions";

type BuilderDay = { label: string; slots: BuilderSlot[] };

export type TemplateBuilderInitial = {
  name: string;
  description?: string | null;
  days: BuilderDay[];
  priorities: { muscleGroupId: number; priority: MgPriority }[];
};

type Props = {
  muscleGroups: { id: number; name: string }[];
  mode: "create" | "edit";
  templateKey?: string;
  initial?: TemplateBuilderInitial;
};

const PRIORITY_OPTIONS: { value: MgPriority; label: string }[] = [
  { value: "maintain", label: "Maintain" },
  { value: "grow", label: "Grow" },
  { value: "emphasize", label: "Emphasize" },
];

/**
 * Custom-template builder. Manages days -> slots and per-muscle-group volume priorities, then
 * saves through a typed server action (the SwapPanel useTransition idiom — the payload is a
 * nested tree FormData handles poorly). Day/slot positions are derived from array order at save
 * time, so add/remove/reorder can't produce gaps. On success the action redirects server-side.
 */
export function TemplateBuilder({ muscleGroups, mode, templateKey, initial }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [days, setDays] = useState<BuilderDay[]>(initial?.days ?? [{ label: "", slots: [] }]);
  const [priorities, setPriorities] = useState<Map<number, MgPriority>>(
    new Map(initial?.priorities.map((p) => [p.muscleGroupId, p.priority])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const mgName = (id: number) => muscleGroups.find((m) => m.id === id)?.name ?? "";
  const newSlot = (): BuilderSlot => ({ muscleGroupId: muscleGroups[0].id, exerciseId: null, exerciseName: null });

  // Muscle groups actually used across all slots — drives the priorities section (sorted by
  // the canonical muscle-group order so it's stable as slots change).
  const usedMgIds = useMemo(() => {
    const used = new Set(days.flatMap((d) => d.slots.map((s) => s.muscleGroupId)));
    return muscleGroups.filter((m) => used.has(m.id)).map((m) => m.id);
  }, [days, muscleGroups]);

  const addDay = () => setDays((ds) => [...ds, { label: "", slots: [] }]);
  const removeDay = (di: number) => setDays((ds) => ds.filter((_, i) => i !== di));
  const setDayLabel = (di: number, label: string) =>
    setDays((ds) => ds.map((d, i) => (i === di ? { ...d, label } : d)));
  const moveDay = (di: number, dir: -1 | 1) =>
    setDays((ds) => {
      const j = di + dir;
      if (j < 0 || j >= ds.length) return ds;
      const next = [...ds];
      [next[di], next[j]] = [next[j], next[di]];
      return next;
    });

  const addSlot = (di: number) =>
    setDays((ds) => ds.map((d, i) => (i === di ? { ...d, slots: [...d.slots, newSlot()] } : d)));
  const updateSlot = (di: number, si: number, slot: BuilderSlot) =>
    setDays((ds) => ds.map((d, i) => (i === di ? { ...d, slots: d.slots.map((s, j) => (j === si ? slot : s)) } : d)));
  const removeSlot = (di: number, si: number) =>
    setDays((ds) => ds.map((d, i) => (i === di ? { ...d, slots: d.slots.filter((_, j) => j !== si) } : d)));

  const setPriority = (mgId: number, priority: MgPriority) =>
    setPriorities((p) => new Map(p).set(mgId, priority));

  const save = () =>
    start(async () => {
      setError(null);
      const input: TemplateBuilderInput = {
        name,
        description,
        days: days.map((d) => ({ label: d.label, slots: d.slots.map((s) => ({ muscleGroupId: s.muscleGroupId, exerciseId: s.exerciseId })) })),
        // Persist a priority for every used group (default maintain) — matches the picker's display.
        priorities: usedMgIds.map((id) => ({ muscleGroupId: id, priority: priorities.get(id) ?? "maintain" })),
      };
      try {
        if (mode === "edit") await updateTemplateAction(templateKey!, input);
        else await createTemplateAction(input);
        // Success never returns here — the action redirect()s server-side.
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save template. Please try again.");
      }
    });

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <label htmlFor="tpl-name" className="mb-1 block text-sm font-medium text-muted">
          Name
        </label>
        <input
          id="tpl-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Upper / Lower Split"
        />

        <label htmlFor="tpl-desc" className="mb-1 mt-4 block text-sm font-medium text-muted">
          Description <span className="font-normal text-muted/70">(optional)</span>
        </label>
        <textarea
          id="tpl-desc"
          className="input min-h-[4.5rem]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="How the program is run — e.g. rep scheme, work:rest, weekly progression."
        />
      </div>

      {/* Days */}
      <div className="space-y-4">
        {days.map((day, di) => (
          <div key={di} className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <input
                className="input flex-1 py-1.5 text-sm font-semibold"
                value={day.label}
                onChange={(e) => setDayLabel(di, e.target.value)}
                placeholder={`Day ${di + 1}`}
                aria-label={`Day ${di + 1} name`}
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveDay(di, -1)}
                  disabled={di === 0}
                  className="rounded-md p-1.5 text-muted hover:text-text disabled:opacity-30"
                  aria-label={`Move day ${di + 1} up`}
                >
                  <ChevronUp aria-hidden size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => moveDay(di, 1)}
                  disabled={di === days.length - 1}
                  className="rounded-md p-1.5 text-muted hover:text-text disabled:opacity-30"
                  aria-label={`Move day ${di + 1} down`}
                >
                  <ChevronDown aria-hidden size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => removeDay(di)}
                  disabled={days.length === 1}
                  className="rounded-md p-1.5 text-muted hover:text-bad disabled:opacity-30"
                  aria-label={`Remove day ${di + 1}`}
                >
                  <Trash2 aria-hidden size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-2 p-3">
              {day.slots.length === 0 && (
                <p className="px-1 py-2 text-sm text-muted">No exercises yet — add one below.</p>
              )}
              {day.slots.map((slot, si) => (
                <TemplateSlotPicker
                  key={si}
                  slot={slot}
                  muscleGroups={muscleGroups}
                  onChange={(s) => updateSlot(di, si, s)}
                  onRemove={() => removeSlot(di, si)}
                />
              ))}
              <button
                type="button"
                onClick={() => addSlot(di)}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-muted hover:text-text"
              >
                <Plus aria-hidden size={15} />
                Add exercise
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addDay}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-medium text-muted hover:text-text"
        >
          <Plus aria-hidden size={15} />
          Add day
        </button>
      </div>

      {/* Volume priorities — one row per muscle group used above. */}
      {usedMgIds.length > 0 && (
        <div className="card p-5">
          <div className="mb-1 text-sm font-semibold">Volume priority</div>
          <p className="mb-4 text-xs text-muted">
            How hard to push each muscle group — sets ramp from MEV toward MRV across the block.
          </p>
          <div className="space-y-2">
            {usedMgIds.map((id) => (
              <div key={id} className="flex items-center gap-3">
                <MgDot color={mgColor(mgName(id))} />
                <span className="flex-1 text-sm" style={{ color: mgColor(mgName(id)) }}>
                  {mgName(id)}
                </span>
                <select
                  className="input py-1.5 sm:max-w-[10rem]"
                  value={priorities.get(id) ?? "maintain"}
                  onChange={(e) => setPriority(id, e.target.value as MgPriority)}
                  aria-label={`${mgName(id)} priority`}
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-bad">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn-primary inline-flex items-center gap-2 px-4 py-2 disabled:opacity-60">
          {pending && <Loader2 aria-hidden size={15} className="animate-spin" />}
          {mode === "edit" ? "Save changes" : "Create template"}
        </button>
      </div>
    </div>
  );
}
