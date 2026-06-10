import { mgColor, rirForWeek } from "@/lib/format";
import { MgDot, StatusPill } from "@/components/ui";
import { SetLogger } from "@/components/SetLogger";

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
  exercise: { name: string; exerciseType: string } | null;
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
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <MgDot color={color} />
                <div>
                  <div className="font-semibold leading-tight">{ex.exercise?.name ?? "—"}</div>
                  <div className="text-xs text-muted" style={{ color }}>
                    {ex.muscleGroup.name}
                    {ex.exercise?.exerciseType ? ` · ${ex.exercise.exerciseType}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* On mobile the per-set RIR column is hidden, so surface the target here */}
                <span className="num whitespace-nowrap text-xs text-muted sm:hidden">
                  {targetRir == null ? "DL" : `${targetRir} RIR`}
                </span>
                <StatusPill status={ex.status} />
              </div>
            </div>
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
