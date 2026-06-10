import { getTemplates } from "@/lib/data";
import { createMesocycleAction } from "@/lib/mesoActions";
import { getDefaultUnit } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

export default async function NewMesoPage() {
  const me = await requireUser();
  const [templates, defaultUnit] = await Promise.all([getTemplates(me.id), getDefaultUnit()]);

  return (
    <>
      <PageHeader title="New mesocycle" subtitle="Generate a training block from a template" />

      <form action={createMesocycleAction} className="card max-w-xl space-y-5 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Template</label>
          <select name="templateKey" required className="input" defaultValue="">
            <option value="" disabled>
              Choose a template…
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.key}>
                {t.name} · {t.emphasis} · {t.sex}
                {t.frequency ? ` · ${t.frequency}×/wk` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Name</label>
          <input name="name" className="input" placeholder="e.g. Summer Block (defaults to template name)" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Length</label>
            <select name="weeks" className="input" defaultValue="5">
              {[4, 5, 6].map((w) => (
                <option key={w} value={w}>
                  {w} weeks ({w - 1} training + 1 deload)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Units</label>
            <select name="unit" className="input" defaultValue={defaultUnit}>
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" className="btn-primary px-4 py-2 text-sm">
            Generate mesocycle
          </button>
          <span className="text-xs text-muted">
            RIR ramps to 0 · volume rises by priority (MEV→MRV) · final week deloads
          </span>
        </div>
      </form>
    </>
  );
}
