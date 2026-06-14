import { mgColor, rirForWeek } from "@/lib/format";
import { ExerciseSets } from "@/components/ExerciseSets";
import { ExerciseInfo } from "@/components/ExerciseInfo";
import { CompleteSession } from "@/components/CompleteSession";

const DONE_STATUSES = new Set(["complete", "skipped"]);

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
};
export type ViewExercise = {
  id: number;
  status: string;
  exercise: { id: number; name: string; exerciseType: string; notes: string | null; youtubeId: string | null } | null;
  muscleGroup: { id: number; name: string };
  sets: ViewSet[];
};
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
}: {
  day: ViewDay;
  meso: { key: string; name: string; weeksCount: number; unit: string };
  muscleGroups: { id: number; name: string }[];
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
            <ExerciseSets sets={ex.sets} targetRir={targetRir} unit={meso.unit} dayExerciseId={ex.id} />
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
