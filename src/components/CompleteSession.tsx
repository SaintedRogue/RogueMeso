"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardList } from "lucide-react";
import { completeDay, type PostCheckInMeta } from "@/lib/actions";
import { SessionCheckIn } from "@/components/SessionCheckIn";
import { ShareWorkoutButton } from "@/components/ShareWorkoutButton";

/** Whether the post check-in already holds anything (drives the survey's initial open state). */
function postHasData(p?: PostCheckInMeta): boolean {
  return (
    !!p &&
    (p.painScore != null ||
      p.painLocations.length > 0 ||
      p.painTiming != null ||
      p.rangeOfMotion != null ||
      p.qualityTags.length > 0 ||
      (p.note?.trim() ?? "") !== "")
  );
}

/**
 * Footer action that explicitly finishes a workout day, and — once done — the whole completion
 * surface: a green "Session complete" status, the post-session "Session Check-In" (which pops open
 * right after finishing), a Share / View-survey button row, and (on the home screen) a "Start next
 * workout" button. Completing simply flips `done` on the next render, so this surface appears in
 * place; the home screen keeps showing the completed day until the next local day.
 */
export function CompleteSession({
  mesoKey,
  week,
  position,
  openSets,
  done,
  dayId,
  physicalTherapyLens = false,
  postInitial,
  nextWorkout = null,
}: {
  mesoKey: string;
  week: number;
  position: number;
  openSets: number;
  done: boolean;
  dayId: number;
  physicalTherapyLens?: boolean;
  postInitial?: PostCheckInMeta;
  /** Upcoming workout to advance to (home screen only); null hides the button. */
  nextWorkout?: { href: string; label: string } | null;
}) {
  const [pending, start] = useTransition();
  // Pop the survey open right after finishing (nothing logged yet); collapsed once it has data.
  const [surveyOpen, setSurveyOpen] = useState(!postHasData(postInitial));

  if (done) {
    const showSurvey = physicalTherapyLens && !!postInitial;
    return (
      <div className="space-y-3">
        <div className="flex w-full items-center justify-center gap-2 rounded-md border border-good/40 bg-good/10 py-3 text-sm font-semibold text-good">
          <CheckCircle2 aria-hidden size={18} /> Session complete
        </div>

        {showSurvey && (
          <SessionCheckIn dayId={dayId} initial={postInitial!} open={surveyOpen} onToggle={() => setSurveyOpen((o) => !o)} />
        )}

        <div className={`grid gap-2 ${showSurvey ? "grid-cols-2" : "grid-cols-1"}`}>
          <ShareWorkoutButton mesoKey={mesoKey} week={week} position={position} />
          {showSurvey && (
            <button
              type="button"
              onClick={() => setSurveyOpen((o) => !o)}
              className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
            >
              <ClipboardList aria-hidden size={16} />
              View post survey
            </button>
          )}
        </div>

        {nextWorkout && (
          <Link
            href={nextWorkout.href}
            className="btn-primary flex min-h-12 w-full items-center justify-center gap-2"
            title={nextWorkout.label}
          >
            Start next workout <ArrowRight aria-hidden size={18} />
          </Link>
        )}
      </div>
    );
  }

  const onClick = () => {
    const proceed =
      openSets === 0 ||
      confirm(
        `Finish this session? ${openSets} unlogged set${openSets === 1 ? "" : "s"} will be skipped.`,
      );
    if (proceed) start(() => completeDay(mesoKey, week, position));
  };

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="btn-primary flex min-h-12 w-full items-center justify-center gap-2 disabled:opacity-60"
    >
      <CheckCircle2 aria-hidden size={18} />
      {pending ? "Finishing…" : "Complete session"}
    </button>
  );
}
