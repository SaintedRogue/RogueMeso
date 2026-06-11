"use client";

// Shared faceted template browser: a searchable, filterable grid of program-template
// cards with an inline accordion preview that pops in as a full-width row right after
// the selected card's row. Both "create a mesocycle" (/mesocycles/new) and "browse the
// library" (/templates) render this same component so the experience is identical — they
// differ only in what fills two slots:
//   • previewFooter — a full-width row rendered directly under the preview (the config +
//     Generate form on /mesocycles/new; a "Use this template" CTA on /templates).
//   • cardFooter — optional per-card footer (the share toggle on the owner's own cards).
// The browser owns selection/filter/preview state; it stays agnostic of ownership, the
// create form, and routing — those live in the thin wrappers that supply the slots.
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { MgDot } from "@/components/ui";
import { mgColor } from "@/lib/format";
import { getTemplatePreview, type TemplatePreview } from "@/lib/mesoActions";

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

export function TemplateBrowser({
  templates,
  defaultSex,
  initialSelectedKey = null,
  selectionFieldName,
  previewFooter,
  cardFooter,
  emptyHint,
}: {
  templates: PickerTemplate[];
  defaultSex: "male" | "female" | null;
  /** Preselect + auto-load a template on mount (e.g. arriving from a "Use this template" link). */
  initialSelectedKey?: string | null;
  /** When set, render a hidden <input name=…> mirroring the selection (the create form's contract). */
  selectionFieldName?: string;
  /** Full-width row rendered right after the preview panel for the selected template. */
  previewFooter?: (selected: PickerTemplate) => React.ReactNode;
  /** Optional footer rendered inside each card (e.g. the owner's share toggle). */
  cardFooter?: (t: PickerTemplate) => React.ReactNode | null;
  /** Shown before anything is selected (omit for a no-op). */
  emptyHint?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [sex, setSex] = useState<string | null>(defaultSex);
  const [equip, setEquip] = useState<Equip | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialSelectedKey);
  // Preview detail is fetched on demand and cached per key (undefined = not fetched,
  // null = fetched but unavailable, object = loaded) so re-selecting is instant.
  const [previews, setPreviews] = useState<Record<string, TemplatePreview | null>>({});
  const [, startPreview] = useTransition();
  // Track the live column count (matches sm:grid-cols-2 / lg:grid-cols-3) so we can pop
  // the preview in as a full-width row right after the selected card's row, not at the
  // bottom of the grid. Defaults to 1 for SSR; corrected on mount before any selection.
  const [cols, setCols] = useState(1);
  useEffect(() => {
    const compute = () =>
      setCols(
        window.matchMedia("(min-width: 1024px)").matches
          ? 3
          : window.matchMedia("(min-width: 640px)").matches
            ? 2
            : 1,
      );
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  function selectTemplate(key: string) {
    setSelectedKey(key);
    if (!(key in previews)) {
      startPreview(async () => {
        const data = await getTemplatePreview(key);
        setPreviews((p) => ({ ...p, [key]: data }));
      });
    }
  }

  // Load the preview for a key we were asked to preselect (e.g. a deep link), once.
  useEffect(() => {
    if (initialSelectedKey && !(initialSelectedKey in previews)) {
      startPreview(async () => {
        const data = await getTemplatePreview(initialSelectedKey);
        setPreviews((p) => ({ ...p, [initialSelectedKey]: data }));
      });
    }
    // Only on mount / when the preselect changes; previews intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedKey]);

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

  // Where the preview slots into the grid: after the last card in the selected card's
  // current-breakpoint row. -1 when nothing is selected or the selection is filtered out.
  const selIdx = selectedKey ? filtered.findIndex((t) => t.key === selectedKey) : -1;
  const previewAfter = selIdx < 0 ? -1 : Math.min((Math.floor(selIdx / cols) + 1) * cols - 1, filtered.length - 1);

  // Full-width preview row: the selected template's priorities + day/slot breakdown.
  // Mirrors the /templates/[key] detail layout; col-span-full makes it span the grid.
  const previewPanel = selected ? (
    <div className="card col-span-full overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <div className="font-semibold leading-tight">{selected.name}</div>
          <div className="text-xs text-muted">
            {selected.emphasis} · {selected.sex}
            {selected.frequency ? ` · ${selected.frequency}×/wk` : ""} ·{" "}
            <span className="num">{selected.days}</span> days
          </div>
        </div>
        <span className="chip border-accent text-accent">Selected</span>
      </div>
      <div className="p-4">
        {!(selectedKey! in previews) ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted">
            <Loader2 aria-hidden size={15} className="animate-spin" /> Loading preview…
          </div>
        ) : previews[selectedKey!] == null ? (
          <p className="py-6 text-sm text-muted">Couldn’t load this template’s details.</p>
        ) : (
          <div className="space-y-4">
            {previews[selectedKey!]!.priorities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {previews[selectedKey!]!.priorities.map((p) => (
                  <span key={p.name} className="chip" style={{ borderColor: mgColor(p.name) }}>
                    <MgDot color={mgColor(p.name)} />
                    {p.name} · {p.priority}
                  </span>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {previews[selectedKey!]!.days.map((d) => (
                <div key={d.position} className="rounded-lg border border-line">
                  <div className="border-b border-line px-3 py-2 text-xs font-semibold">Day {d.position + 1}</div>
                  <div className="divide-y divide-line/60">
                    {d.slots.map((s, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-1.5 text-xs">
                        <MgDot color={mgColor(s.mg)} />
                        <span style={{ color: mgColor(s.mg), minWidth: "4.5rem" }}>{s.mg}</span>
                        <span>{s.exercise ?? <span className="italic text-muted">empty slot</span>}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  // The slot under the preview: config + Generate (create) or a CTA (browse).
  const footerRow = selected && previewFooter ? previewFooter(selected) : null;

  // The preview + its footer as one unit. Placed inline after the selected card's row
  // when that card is visible; rendered out-of-grid (below) when the selection is hidden
  // by the current filters — so the preview and its primary action are never unreachable.
  const previewBlock = selected ? (
    <>
      {previewPanel}
      {footerRow}
    </>
  ) : null;

  return (
    <div className="space-y-5">
      {selectionFieldName && <input type="hidden" name={selectionFieldName} value={selectedKey ?? ""} />}

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
          {filtered.map((t, idx) => {
            const eq = equipOf(t.name);
            const isSel = t.key === selectedKey;
            const footer = cardFooter?.(t) ?? null;
            return (
              <Fragment key={t.key}>
                {/* Card = clickable body (selects + opens preview) plus an optional
                    footer (e.g. share toggle). The footer lives outside the button so
                    interacting with it never triggers selection. */}
                <div
                  className={`card flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:border-accent/50 ${
                    isSel ? "border-accent ring-1 ring-inset ring-accent" : ""
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={isSel}
                    onClick={() => selectTemplate(t.key)}
                    className={`block flex-1 p-4 text-left transition-colors hover:bg-panel-2/40 ${
                      isSel ? "bg-panel-2/40" : ""
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
                  {footer && (
                    <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
                      {footer}
                    </div>
                  )}
                </div>
                {idx === previewAfter && previewBlock}
              </Fragment>
            );
          })}
        </div>
      ) : (
        <div className="card px-4 py-8 text-center text-muted">No templates match these filters.</div>
      )}

      {/* Selection survives a filter change that hides its card: show the preview (and its
          Generate/CTA footer) out-of-grid so the user is never silently stranded. */}
      {selected && selIdx < 0 && (
        <div className="space-y-5">
          <p className="text-xs text-muted">
            Your selected template is hidden by the current filters — clear a filter to see its card.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{previewBlock}</div>
        </div>
      )}

      {!selected && emptyHint}
    </div>
  );
}
