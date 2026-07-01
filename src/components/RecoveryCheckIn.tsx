"use client";

import { useState, useTransition } from "react";
import { saveSessionPreCheckIn, type PreCheckInMeta } from "@/lib/actions";
import type { LastSessionSummary } from "@/lib/data";
import { toast } from "@/components/Toaster";
import { PAIN_REGIONS, PAIN_REGION_LABELS, type PainRegion } from "@/lib/features/physicalTherapyTaxonomy";
import { PainSlider, Chips, NoteField, SaveButton, CheckInCard, toggleIn } from "@/components/PtSurveyControls";

const regionLabel = (r: string) => PAIN_REGION_LABELS[r as PainRegion] ?? r;

/**
 * Pre-workout "Recovery Check-In" (Physical Therapy Lens): a light, skippable snapshot of how
 * you're arriving — pain, where, and a note. Shown at the top of the session, collapsed by
 * default, with last session's post symptoms surfaced so you can note how things evolved during
 * recovery. Only mounted when the lens is ON.
 */
export function RecoveryCheckIn({
  dayId,
  initial,
  lastSession,
}: {
  dayId: number;
  initial: PreCheckInMeta;
  lastSession: LastSessionSummary;
}) {
  const [pending, start] = useTransition();
  const [painScore, setPainScore] = useState<number | null>(initial.painScore);
  const [painLocations, setPainLocations] = useState<string[]>(initial.painLocations);
  const [note, setNote] = useState<string>(initial.note ?? "");

  const hasData = painScore != null || painLocations.length > 0 || note.trim() !== "";

  const save = () =>
    start(async () => {
      try {
        await saveSessionPreCheckIn(dayId, { painScore, painLocations, note });
        toast("Recovery check-in saved");
      } catch {
        toast("Couldn't save check-in — try again.", "error");
      }
    });

  const lastHasData = lastSession && (lastSession.painScore != null || lastSession.regions.length > 0);

  return (
    <CheckInCard title="Recovery Check-In" hasData={hasData}>
      {lastHasData && (
        <p className="rounded-md border border-line/60 bg-input/40 px-3 py-2 text-xs text-muted">
          Last session
          {lastSession.label ? ` (${lastSession.label})` : ""}:{" "}
          {lastSession.painScore != null ? (
            <span className="text-text">pain {lastSession.painScore}/10</span>
          ) : (
            "no pain logged"
          )}
          {lastSession.regions.length ? ` · ${lastSession.regions.map(regionLabel).join(", ")}` : ""}. How has it
          changed?
        </p>
      )}

      <PainSlider id="recovery-pain" value={painScore} onChange={setPainScore} />

      <Chips
        label="Where"
        options={PAIN_REGIONS as readonly PainRegion[]}
        labels={PAIN_REGION_LABELS}
        selected={painLocations}
        onToggle={(v) => setPainLocations(toggleIn(painLocations, v))}
      />

      <NoteField value={note} onChange={setNote} placeholder="e.g. shoulder still tight from Monday" />

      <SaveButton pending={pending} onClick={save} />
    </CheckInCard>
  );
}
