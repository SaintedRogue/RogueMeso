import { mgColor, rirForWeek } from "@/lib/format";
import { DONE_STATUSES } from "@/lib/dayStatus";
import type { SetSuggestion } from "@/lib/suggestions";
import type { PreCheckInMeta, PostCheckInMeta } from "@/lib/actions";
import type { SessionCheckInRow, LastSessionSummary } from "@/lib/data";
import { parseJsonArray } from "@/lib/json";
import { ExerciseSets } from "@/components/ExerciseSets";
import { ExerciseInfo } from "@/components/ExerciseInfo";
import { CompleteSession } from "@/components/CompleteSession";
import { RecoveryCheckIn } from "@/components/RecoveryCheckIn";

// Structural types (subset of the Prisma payload) this view needs.
export type ViewSet = {
  id: number;
  position: number;
  weight: number | null;
  weightTarget: number | null;
  weightTargetMin: number | null;
  weightTargetMax: number | null;
  reps: number | null;
  repsTarget: number | null;
  status: string;
  unit: string | null;
  side: string | null; // Physical Therapy Lens: "left" | "right" | "bilateral" | null
};
export type ViewExercise = {
  id: number;
  status: string;
  exercise: { id: number; name: string; exerciseType: string; notes: string | null; youtubeId: string | null } | null;
  muscleGroup: { id: number; name: string };
  sets: ViewSet[];
};
export type ViewDay = {
  id: number;
  week: number;
  position: number;
  label: string | null;
  status: string;
  exercises: ViewExercise[];
};

export function DayView({
  day,
  meso,
  muscleGroups,
  suggestions = {},
  physicalTherapyLens = false,
  checkIn = null,
  lastSession = null,
  nextWorkout = null,
}: {
  day: ViewDay;
  meso: { key: string; name: string; weeksCount: number; unit: string };
  muscleGroups: { id: number; name: string }[];
  /** Shaded "same day last week" targets, keyed by current set id. */
  suggestions?: Record<number, SetSuggestion>;
  /** When true, reveal the per-session check-ins + per-set side control. */
  physicalTherapyLens?: boolean;
  /** Raw pre/post check-in row for this session (Physical Therapy Lens). */
  checkIn?: SessionCheckInRow;
  /** Previous session's post symptoms, for the pre-form context. */
  lastSession?: LastSessionSummary;
  /** Upcoming workout to advance to once this session is done (home screen only). */
  nextWorkout?: { href: string; label: string } | null;
}) {
  const openSets = day.exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => !DONE_STATUSES.has(s.status)).length,
    0,
  );
  const done = day.status === "complete";

  const preInitial: PreCheckInMeta = {
    painScore: checkIn?.prePainScore ?? null,
    painLocations: parseJsonArray(checkIn?.prePainLocations),
    note: checkIn?.preNote ?? null,
  };
  const postInitial: PostCheckInMeta = {
    painScore: checkIn?.postPainScore ?? null,
    painLocations: parseJsonArray(checkIn?.postPainLocations),
    painTiming: checkIn?.postPainTiming ?? null,
    rangeOfMotion: checkIn?.postRangeOfMotion ?? null,
    qualityTags: parseJsonArray(checkIn?.postQualityTags),
    note: checkIn?.postNote ?? null,
  };

  return (
    <div className="space-y-4">
      {/* Pre-workout Recovery Check-In — top of the session, until it's finished. */}
      {physicalTherapyLens && !done && day.exercises.length > 0 && (
        <RecoveryCheckIn dayId={day.id} initial={preInitial} lastSession={lastSession} />
      )}

      {day.exercises.length === 0 && (
        <div className="card p-6 text-center text-muted">No exercises for this day.</div>
      )}
      {day.exercises.map((ex) => {
        const color = mgColor(ex.muscleGroup.name);
        const targetRir = rirForWeek(day.week, meso.weeksCount);
        return (
          <div key={ex.id} className="card overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
            <ExerciseInfo
              name={ex.exercise?.name ?? "—"}
              muscleGroupName={ex.muscleGroup.name}
              color={color}
              exerciseType={ex.exercise?.exerciseType ?? null}
              rirLabel={targetRir == null ? "DL" : `${targetRir} RIR`}
              status={ex.status}
              notes={ex.exercise?.notes ?? null}
              youtubeId={ex.exercise?.youtubeId ?? null}
              dayExerciseId={ex.id}
              currentExerciseId={ex.exercise?.id ?? null}
              muscleGroupId={ex.muscleGroup.id}
              muscleGroups={muscleGroups}
            />
            <ExerciseSets
              sets={ex.sets}
              targetRir={targetRir}
              unit={meso.unit}
              dayExerciseId={ex.id}
              suggestions={suggestions}
              physicalTherapyLens={physicalTherapyLens}
            />
          </div>
        );
      })}
      {day.exercises.length > 0 && (
        <CompleteSession
          mesoKey={meso.key}
          week={day.week}
          position={day.position}
          openSets={openSets}
          done={done}
          dayId={day.id}
          physicalTherapyLens={physicalTherapyLens}
          postInitial={postInitial}
          nextWorkout={nextWorkout}
        />
      )}
    </div>
  );
}
