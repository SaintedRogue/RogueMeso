"use client";

import { useState, useTransition } from "react";
import { saveSessionPostCheckIn, type PostCheckInMeta } from "@/lib/actions";
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
import { PainSlider, Chips, Segmented, NoteField, SaveButton, CheckInCard, toggleIn } from "@/components/PtSurveyControls";

/**
 * Post-session "Session Check-In" (Physical Therapy Lens): the full movement-quality & symptom
 * survey, prompted after a session is completed. Skippable. Mounted (only when the lens is ON)
 * once the day is complete; opens automatically when nothing's logged yet so the check-in is
 * front-and-centre right after finishing, and stays collapsed once answered.
 */
export function SessionCheckIn({ dayId, initial }: { dayId: number; initial: PostCheckInMeta }) {
  const [pending, start] = useTransition();

  const [painScore, setPainScore] = useState<number | null>(initial.painScore);
  const [painLocations, setPainLocations] = useState<string[]>(initial.painLocations);
  const [painTiming, setPainTiming] = useState<string | null>(initial.painTiming);
  const [rom, setRom] = useState<string | null>(initial.rangeOfMotion);
  const [quality, setQuality] = useState<string[]>(initial.qualityTags);
  const [note, setNote] = useState<string>(initial.note ?? "");

  const hasData =
    painScore != null || painLocations.length > 0 || painTiming != null || rom != null || quality.length > 0 || note.trim() !== "";

  const save = () =>
    start(async () => {
      try {
        await saveSessionPostCheckIn(dayId, {
          painScore,
          painLocations,
          painTiming,
          rangeOfMotion: rom,
          qualityTags: quality,
          note,
        });
        toast("Session check-in saved");
      } catch {
        toast("Couldn't save check-in — try again.", "error");
      }
    });

  return (
    <CheckInCard title="Session Check-In" hasData={hasData} defaultOpen={!hasData}>
      <p className="text-xs text-muted">How did the session go? All optional.</p>

      <PainSlider id="session-pain" value={painScore} onChange={setPainScore} />

      <Chips
        label="Where"
        options={PAIN_REGIONS as readonly PainRegion[]}
        labels={PAIN_REGION_LABELS}
        selected={painLocations}
        onToggle={(v) => setPainLocations(toggleIn(painLocations, v))}
      />

      <Segmented label="When" options={PAIN_TIMINGS} labels={PAIN_TIMING_LABELS} value={painTiming} onChange={setPainTiming} />

      <Segmented label="Range of motion" options={ROM_OPTIONS} labels={ROM_LABELS} value={rom} onChange={setRom} />

      <Chips
        label="Quality"
        options={QUALITY_TAGS as readonly QualityTag[]}
        labels={QUALITY_TAG_LABELS}
        selected={quality}
        onToggle={(v) => setQuality(toggleIn(quality, v))}
      />

      <NoteField value={note} onChange={setNote} placeholder="e.g. elbow cranky on the close-grip work" />

      <SaveButton pending={pending} onClick={save} />
    </CheckInCard>
  );
}
