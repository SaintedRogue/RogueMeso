"use client";

// Create-mode wrapper around the shared TemplateBrowser: the browser handles search,
// filtering and the inline preview; this adds the mesocycle config (name / length / units)
// and the Generate CTA as the full-width row directly under the selected template's
// preview — so the primary action is reachable without scrolling past 150+ cards. The
// parent server page renders the surrounding <form action={createMesocycleAction}>; the
// hidden `templateKey` field (emitted by the browser via selectionFieldName) is the
// submission contract, so the server action stays unchanged.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { Unit } from "@prisma/client";
import { TemplateBrowser, type PickerTemplate } from "@/components/TemplateBrowser";

export type { PickerTemplate };

/** Submit button — the config row only renders once a template is selected, so selection
 *  is already implied; it gates on form-pending alone. */
function GenerateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm disabled:opacity-60"
    >
      {pending && <Loader2 aria-hidden size={14} className="animate-spin" />}
      Generate mesocycle
    </button>
  );
}

export function TemplatePicker({
  templates,
  defaultSex,
  defaultUnit,
  initialSelectedKey = null,
}: {
  templates: PickerTemplate[];
  defaultSex: "male" | "female" | null;
  defaultUnit: Unit;
  initialSelectedKey?: string | null;
}) {
  // Config inputs live here (not in the slot) so they survive the config card remounting
  // as it follows the selected template to a different grid row.
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState("5");
  const [unit, setUnit] = useState<Unit>(defaultUnit);

  // Name / length / units + the Generate CTA, rendered as the full-width row under the
  // preview for the selected template.
  const configCard = (selected: PickerTemplate) => (
    <div className="card col-span-full space-y-5 p-6">
      <div>
        <label className="mb-1 block text-sm font-medium text-muted">Name</label>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          placeholder={`e.g. Summer Block (defaults to ${selected.name})`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Length</label>
          <select name="weeks" value={weeks} onChange={(e) => setWeeks(e.target.value)} className="input">
            {[4, 5, 6].map((w) => (
              <option key={w} value={w}>
                {w} weeks ({w - 1} training + 1 deload)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Units</label>
          <select name="unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className="input">
            <option value="lb">lb</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <GenerateButton />
        <span className="text-xs text-muted">
          RIR ramps to 0 · volume rises by priority (MEV→MRV) · final week deloads
        </span>
      </div>
    </div>
  );

  return (
    <TemplateBrowser
      templates={templates}
      defaultSex={defaultSex}
      initialSelectedKey={initialSelectedKey}
      selectionFieldName="templateKey"
      previewFooter={configCard}
      emptyHint={
        <p className="card px-4 py-6 text-center text-sm text-muted">Pick a template above to continue.</p>
      }
    />
  );
}
