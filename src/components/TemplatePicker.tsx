"use client";

// Faceted catalog for choosing a program template when creating a mesocycle.
// Replaces a 153-option <select> with a searchable, filterable grid of cards.
// Filtering is client-side over the full (small) template list for instant feedback.
// This component owns the selection so the submit button can gate on it; the parent
// server page only renders the <form action={createMesocycleAction}> wrapper, so the
// server action stays server-defined and the submission contract (a templateKey field)
// is unchanged.
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { Unit } from "@prisma/client";

export type PickerTemplate = {
  key: string;
  name: string;
  emphasis: string;
  sex: string;
  frequency: number | null;
  days: number;
};

type Equip = "barbell" | "dumbbell" | "gym";

/** Equipment isn't a column — it only appears as a word inside the template name. */
function equipOf(name: string): Equip | null {
  const n = name.toLowerCase();
  if (n.includes("barbell")) return "barbell";
  if (n.includes("dumbbell")) return "dumbbell";
  if (n.includes("gym")) return "gym";
  return null;
}

const EQUIP_LABEL: Record<Equip, string> = { barbell: "Barbell", dumbbell: "Dumbbell", gym: "Gym" };

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`chip chip-nav ${active ? "border-accent text-accent" : "hover:text-text"}`}
    >
      {children}
    </button>
  );
}

/** Submit gated on both form-pending and a template having been selected. */
function GenerateButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
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
}: {
  templates: PickerTemplate[];
  defaultSex: "male" | "female" | null;
  defaultUnit: Unit;
}) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [sex, setSex] = useState<string | null>(defaultSex);
  const [equip, setEquip] = useState<Equip | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Facet options derived from the data (so chips stay correct if the catalog changes).
  const focuses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of templates) counts.set(t.emphasis, (counts.get(t.emphasis) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [templates]);

  const frequencies = useMemo(
    () => [...new Set(templates.map((t) => t.frequency).filter((f): f is number => f != null))].sort((a, b) => a - b),
    [templates],
  );

  const sexes = useMemo(() => [...new Set(templates.map((t) => t.sex))].sort(), [templates]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return templates.filter((t) => {
      if (needle && !t.name.toLowerCase().includes(needle)) return false;
      if (focus && t.emphasis !== focus) return false;
      if (days != null && t.frequency !== days) return false;
      if (sex && t.sex !== sex) return false;
      if (equip && equipOf(t.name) !== equip) return false;
      return true;
    });
  }, [templates, q, focus, days, sex, equip]);

  const selected = selectedKey ? templates.find((t) => t.key === selectedKey) ?? null : null;

  return (
    <div className="space-y-5">
      <input type="hidden" name="templateKey" value={selectedKey ?? ""} />

      {/* Search + facet filters */}
      <div className="space-y-3">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search templates…"
          autoComplete="off"
          aria-label="Search templates"
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs font-medium text-muted">Focus</span>
          <Chip active={!focus} onClick={() => setFocus(null)}>
            All
          </Chip>
          {focuses.map((f) => (
            <Chip key={f} active={focus === f} onClick={() => setFocus(focus === f ? null : f)}>
              {f}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs font-medium text-muted">Days</span>
          <Chip active={days == null} onClick={() => setDays(null)}>
            Any
          </Chip>
          {frequencies.map((f) => (
            <Chip key={f} active={days === f} onClick={() => setDays(days === f ? null : f)}>
              {f}×/wk
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs font-medium text-muted">Sex</span>
          <Chip active={!sex} onClick={() => setSex(null)}>
            Any
          </Chip>
          {sexes.map((s) => (
            <Chip key={s} active={sex === s} onClick={() => setSex(sex === s ? null : s)}>
              {s}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs font-medium text-muted">Equip</span>
          <Chip active={!equip} onClick={() => setEquip(null)}>
            Any
          </Chip>
          {(Object.keys(EQUIP_LABEL) as Equip[]).map((e) => (
            <Chip key={e} active={equip === e} onClick={() => setEquip(equip === e ? null : e)}>
              {EQUIP_LABEL[e]}
            </Chip>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted">
        showing <span className="num">{filtered.length}</span> of <span className="num">{templates.length}</span>
      </p>

      {/* Card grid */}
      {filtered.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const eq = equipOf(t.name);
            const isSel = t.key === selectedKey;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={isSel}
                onClick={() => setSelectedKey(t.key)}
                className={`card block p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:bg-panel-2/40 ${
                  isSel ? "border-accent bg-panel-2/40 ring-1 ring-inset ring-accent" : ""
                }`}
              >
                <div className="font-semibold leading-tight">{t.name}</div>
                <div className="mt-1 text-xs text-muted">
                  {t.emphasis} · {t.sex}
                  {t.frequency ? ` · ${t.frequency}×/wk` : ""}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">
                    <span className="num">{t.days}</span> training days
                  </span>
                  {eq && <span className="chip">{EQUIP_LABEL[eq]}</span>}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="card px-4 py-8 text-center text-muted">No templates match these filters.</div>
      )}

      {/* Configure & create */}
      <div className="card space-y-5 p-6">
        <p className="text-sm">
          {selected ? (
            <>
              <span className="text-muted">Selected:</span> <span className="font-semibold">{selected.name}</span>
            </>
          ) : (
            <span className="text-muted">Pick a template above to continue.</span>
          )}
        </p>

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
          <GenerateButton disabled={!selectedKey} />
          <span className="text-xs text-muted">
            RIR ramps to 0 · volume rises by priority (MEV→MRV) · final week deloads
          </span>
        </div>
      </div>
    </div>
  );
}
