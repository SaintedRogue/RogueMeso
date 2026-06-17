import { logReadiness } from "@/lib/recoveryActions";
import { ToastForm } from "@/components/forms";
import type { ReadinessView } from "@/lib/features/recovery";

const SORENESS_OPTIONS = [
  { value: 1, label: "1 · None" },
  { value: 2, label: "2 · Slight" },
  { value: 3, label: "3 · Moderate" },
  { value: 4, label: "4 · Sore" },
  { value: 5, label: "5 · Very sore" },
];

const ENERGY_OPTIONS = [
  { value: 1, label: "1 · Drained" },
  { value: 2, label: "2 · Low" },
  { value: 3, label: "3 · OK" },
  { value: 4, label: "4 · Good" },
  { value: 5, label: "5 · Great" },
];

/**
 * Daily readiness check-in. Server-rendered, uncontrolled fields bound to the logReadiness
 * action via ToastForm. Pre-fills from today's entry when one already exists (re-logging
 * upserts the same dated row). Sleep is the heaviest-weighted input.
 */
export function CheckInForm({ today }: { today: ReadinessView | null }) {
  return (
    <ToastForm
      action={logReadiness}
      submitLabel={today ? "Update check-in" : "Log check-in"}
      className="card flex flex-col gap-4 p-6"
      submitClassName="btn-primary px-4 py-2 text-sm self-start"
    >
      <div className="text-sm font-medium text-muted">{today ? "Today's check-in" : "How recovered do you feel?"}</div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="sleepHours" className="mb-1 block text-sm font-medium text-muted">Sleep (hours)</label>
          <input
            id="sleepHours"
            name="sleepHours"
            type="number"
            step="0.5"
            min="0"
            max="24"
            required
            defaultValue={today?.sleepHours ?? ""}
            placeholder="8"
            className="input"
          />
        </div>
        <div>
          <label htmlFor="soreness" className="mb-1 block text-sm font-medium text-muted">Soreness</label>
          <select id="soreness" name="soreness" defaultValue={today?.soreness ?? 3} className="input">
            {SORENESS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="energy" className="mb-1 block text-sm font-medium text-muted">Energy</label>
          <select id="energy" name="energy" defaultValue={today?.energy ?? 3} className="input">
            {ENERGY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="note" className="mb-1 block text-sm font-medium text-muted">Note (optional)</label>
        <input id="note" name="note" type="text" maxLength={500} defaultValue={today?.note ?? ""} placeholder="Anything worth remembering" className="input" />
      </div>
    </ToastForm>
  );
}
