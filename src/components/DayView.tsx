import { mgColor, rirForWeek } from "@/lib/format";
import { DONE_STATUSES } from "@/lib/dayStatus";
import type { SetSuggestion } from "@/lib/suggestions";
import { ExerciseSets } from "@/components/ExerciseSets";
import { ExerciseInfo } from "@/components/ExerciseInfo";
import { CompleteSession } from "@/components/CompleteSession";
import { PhysicalTherapyCapture } from "@/components/PhysicalTherapyCapture";
import type { PtExerciseMeta } from "@/lib/actions";

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
  // Physical Therapy Lens capture (raw DB shape; JSON arrays as strings). Present but ignored
  // when the lens is OFF.
  painScore: number | null;
  painLocations: string | null;
  painTiming: string | null;
  rangeOfMotion: string | null;
  qualityTags: string | null;
  ptNote: string | null;
};

/** Parse the raw DayExercise columns into the capture component's initial value. */
function toCaptureInitial(ex: ViewExercise): PtExerciseMeta {
  const arr = (json: string | null): string[] => {
    if (!json) return [];
    try {
      const v = JSON.parse(json);
      return Array.isArray(v) ? (v as string[]) : [];
    } catch {
      return [];
    }
  };
  return {
    painScore: ex.painScore,
    painLocations: arr(ex.painLocations),
    painTiming: ex.painTiming,
    rangeOfMotion: ex.rangeOfMotion,
    qualityTags: arr(ex.qualityTags),
    ptNote: ex.ptNote,
  };
}
export type ViewDay = {
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
}: {
  day: ViewDay;
  meso: { key: string; name: string; weeksCount: number; unit: string };
  muscleGroups: { id: number; name: string }[];
  /** Shaded "same day last week" targets, keyed by current set id. */
  suggestions?: Record<number, SetSuggestion>;
  /** When true, reveal the per-exercise capture panel + per-set side control. */
  physicalTherapyLens?: boolean;
}) {
  const openSets = day.exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => !DONE_STATUSES.has(s.status)).length,
    0,
  );
  return (
    <div className="space-y-4">
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
            {physicalTherapyLens && (
              <PhysicalTherapyCapture dayExerciseId={ex.id} initial={toCaptureInitial(ex)} />
            )}
          </div>
        );
      })}
      {day.exercises.length > 0 && (
        <CompleteSession
          mesoKey={meso.key}
          week={day.week}
          position={day.position}
          openSets={openSets}
          done={day.status === "complete"}
        />
      )}
    </div>
  );
}
