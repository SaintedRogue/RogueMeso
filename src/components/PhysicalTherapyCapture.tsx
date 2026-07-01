"use client";

import { useId, useState, useTransition } from "react";
import { Activity, Loader2 } from "lucide-react";
import { savePhysicalTherapyExerciseMeta, type PtExerciseMeta } from "@/lib/actions";
import { toast } from "@/components/Toaster";
import {
  PAIN_REGIONS,
  PAIN_REGION_LABELS,
  PAIN_TIMINGS,
  PAIN_TIMING_LABELS,
  ROM_OPTIONS,
  ROM_LABELS,
  QUALITY_TAGS,
  QUALITY_TAG_LABELS,
  type PainRegion,
  type QualityTag,
} from "@/lib/features/physicalTherapyTaxonomy";

/**
 * Optional per-exercise movement-quality & symptom capture (Physical Therapy Lens). Collapsed by
 * default and entirely skippable — logging a set is unchanged for anyone who ignores it. Only
 * mounted when the lens is ON. All fields are optional; "Save" persists whatever is filled in.
 */
export function PhysicalTherapyCapture({
  dayExerciseId,
  initial,
}: {
  dayExerciseId: number;
  initial: PtExerciseMeta;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [painScore, setPainScore] = useState<number | null>(initial.painScore);
  const [painLocations, setPainLocations] = useState<string[]>(initial.painLocations);
  const [painTiming, setPainTiming] = useState<string | null>(initial.painTiming);
  const [rom, setRom] = useState<string | null>(initial.rangeOfMotion);
  const [quality, setQuality] = useState<string[]>(initial.qualityTags);
  const [note, setNote] = useState<string>(initial.ptNote ?? "");

  // A compact summary in the collapsed header, so logged data is visible without expanding.
  const hasData =
    painScore != null || painLocations.length > 0 || rom != null || quality.length > 0 || note.trim() !== "";

  const toggleIn = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const save = () =>
    start(async () => {
      try {
        await savePhysicalTherapyExerciseMeta(dayExerciseId, {
          painScore,
          painLocations,
          painTiming,
          rangeOfMotion: rom,
          qualityTags: quality,
          ptNote: note,
        });
        toast("Movement notes saved");
      } catch {
        toast("Couldn't save movement notes — try again.", "error");
      }
    });

  return (
    <div className="border-t border-line/60 text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted transition-colors hover:text-text"
      >
        <Activity aria-hidden size={14} className={hasData ? "text-accent" : ""} />
        <span>Movement &amp; symptoms</span>
        {hasData && <span className="chip" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }}>logged</span>}
        <span className="ml-auto">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div id={panelId} className="space-y-4 border-t border-line/60 bg-panel/40 px-3 py-3">
          {/* Pain */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor={`${panelId}-pain`} className="text-xs font-medium text-muted">
                Pain
              </label>
              <span className="num text-xs">{painScore ?? "—"}{painScore != null ? "/10" : ""}</span>
            </div>
            <input
              id={`${panelId}-pain`}
              type="range"
              min={0}
              max={10}
              step={1}
              value={painScore ?? 0}
              onChange={(e) => setPainScore(Number(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
            {painScore != null && (
              <button type="button" onClick={() => setPainScore(null)} className="mt-1 text-xs text-muted hover:text-text">
                clear pain
              </button>
            )}
          </div>

          {/* Pain location (multi) */}
          <Chips
            label="Where"
            options={PAIN_REGIONS as readonly PainRegion[]}
            labels={PAIN_REGION_LABELS}
            selected={painLocations}
            onToggle={(v) => toggleIn(painLocations, setPainLocations, v)}
          />

          {/* Pain timing (single) */}
          <Segmented
            label="When"
            options={PAIN_TIMINGS}
            labels={PAIN_TIMING_LABELS}
            value={painTiming}
            onChange={setPainTiming}
          />

          {/* Range of motion (single) */}
          <Segmented label="Range of motion" options={ROM_OPTIONS} labels={ROM_LABELS} value={rom} onChange={setRom} />

          {/* Quality tags (multi) */}
          <Chips
            label="Quality"
            options={QUALITY_TAGS as readonly QualityTag[]}
            labels={QUALITY_TAG_LABELS}
            selected={quality}
            onToggle={(v) => toggleIn(quality, setQuality, v)}
          />

          {/* Note */}
          <div>
            <label htmlFor={`${panelId}-note`} className="mb-1 block text-xs font-medium text-muted">
              Note
            </label>
            <textarea
              id={`${panelId}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. elbow cranky on the close-grip work"
              className="input w-full resize-y py-1.5 text-sm"
            />
          </div>

          <button onClick={save} disabled={pending} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50">
            {pending && <Loader2 aria-hidden size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      )}
    </div>
  );
}

/** Multi-select chip row (pain locations, quality tags). */
function Chips<T extends string>({
  label,
  options,
  labels,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected: string[];
  onToggle: (value: T) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                on ? "border-accent bg-accent/10 text-text" : "border-line text-muted hover:text-text"
              }`}
            >
              {labels[o]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Single-select segmented control (timing, ROM). Re-tapping the active option clears it. */
function Segmented<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : o)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                on ? "border-accent bg-accent/10 text-text" : "border-line text-muted hover:text-text"
              }`}
            >
              {labels[o]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
