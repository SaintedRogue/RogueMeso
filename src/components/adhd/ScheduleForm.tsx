"use client";

// Daily-schedule anchors. Every reminder time is computed relative to these, so this is
// the one form the whole engine depends on. Times use native <input type="time"> (great
// mobile pickers); the action converts "HH:MM" → HHMM integers.
import { ToastForm } from "@/components/forms";
import { saveSchedule } from "@/lib/adhdModeActions";

function toTimeStr(hhmm: number | null): string {
  if (hhmm == null) return "";
  const h = Math.floor(hhmm / 100);
  const m = hhmm % 100;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type Props = {
  wakeHHMM: number;
  bedtimeHHMM: number;
  workoutHHMM: number | null;
  mealsPerDay: number;
};

export function ScheduleForm({ wakeHHMM, bedtimeHHMM, workoutHHMM, mealsPerDay }: Props) {
  return (
    <ToastForm action={saveSchedule} submitLabel="Save schedule" className="card space-y-4 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field id="wake" label="Wake time">
          <input id="wake" name="wake" type="time" required defaultValue={toTimeStr(wakeHHMM)} className="input" />
        </Field>
        <Field id="bedtime" label="Target bedtime">
          <input id="bedtime" name="bedtime" type="time" required defaultValue={toTimeStr(bedtimeHHMM)} className="input" />
        </Field>
        <Field id="workout" label="Typical workout" hint="Leave blank on rest days">
          <input id="workout" name="workout" type="time" defaultValue={toTimeStr(workoutHHMM)} className="input" />
        </Field>
      </div>
      <Field id="mealsPerDay" label="Meals per day">
        <select id="mealsPerDay" name="mealsPerDay" defaultValue={String(mealsPerDay)} className="input sm:w-40">
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} meals
            </option>
          ))}
        </select>
      </Field>
    </ToastForm>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
