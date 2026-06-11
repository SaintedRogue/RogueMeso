import { mgColor, rirForWeek } from "@/lib/format";
import { SetLogger } from "@/components/SetLogger";
import { ExerciseInfo } from "@/components/ExerciseInfo";

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
  exercise: { name: string; exerciseType: string; notes: string | null; youtubeId: string | null } | null;
  muscleGroup: { name: string };
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
}: {
  day: ViewDay;
  meso: { name: string; weeksCount: number; unit: string };
}) {
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
            />
            <div className="divide-y divide-line/60">
              {ex.sets.map((s) => (
                <SetLogger key={s.id} set={s} targetRir={targetRir} unit={meso.unit} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
