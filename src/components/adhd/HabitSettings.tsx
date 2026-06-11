"use client";

// Registry-driven habit list. Imports HABIT_REGISTRY directly (so the compute/payload
// functions and icon components never cross the server→client prop boundary) and renders
// one ToastForm per habit. Adding a habit to the registry makes a card appear here for
// free — no change to this file.
import { ToastForm } from "@/components/forms";
import { ParamControl } from "./ParamControl";
import { HABIT_REGISTRY } from "@/lib/features/adhdModeRegistry";
import { mergeParams } from "@/lib/features/adhdMode";
import { saveHabitConfig } from "@/lib/adhdModeActions";

type HabitConfigMap = Record<string, { enabled: boolean; params: Record<string, number | boolean | string> }>;

export function HabitSettings({ configs }: { configs: HabitConfigMap }) {
  return (
    <div className="space-y-3">
      {HABIT_REGISTRY.map((habit) => {
        const cfg = configs[habit.key];
        const enabled = cfg ? cfg.enabled : habit.defaultEnabled;
        const params = mergeParams(habit, cfg?.params ?? null);
        const Icon = habit.icon;
        return (
          <ToastForm key={habit.key} action={saveHabitConfig} submitLabel="Save" className="card space-y-3 p-4">
            <input type="hidden" name="habitKey" value={habit.key} />
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-panel-2 text-accent">
                <Icon size={18} aria-hidden />
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{habit.label}</span>
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input type="checkbox" name="enabled" defaultChecked={enabled} className="h-4 w-4 accent-accent" />
                    Enabled
                  </label>
                </div>
                <p className="mt-0.5 text-sm text-muted">{habit.description}</p>
              </div>
            </div>
            {habit.params.length > 0 && (
              <div className="space-y-3 sm:pl-12">
                {habit.params.map((def) => (
                  <ParamControl key={def.key} def={def} defaultValue={params[def.key]} />
                ))}
              </div>
            )}
          </ToastForm>
        );
      })}
    </div>
  );
}
