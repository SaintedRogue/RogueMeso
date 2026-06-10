import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getExercises, getMuscleGroups } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { PageHeader, MgDot } from "@/components/ui";
import { mgColor } from "@/lib/format";

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mg?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const mgId = sp.mg ? Number(sp.mg) : undefined;
  const [exercises, muscleGroups] = await Promise.all([getExercises(me.id, q, mgId), getMuscleGroups()]);

  const qs = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: q || undefined, mg: mgId ? String(mgId) : undefined, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/exercises?${s}` : "/exercises";
  };

  return (
    <>
      <PageHeader title="Exercises" subtitle={`${exercises.length} in catalog`} />

      <form className="mb-4">
        {mgId && <input type="hidden" name="mg" value={mgId} />}
        <input
          className="input"
          name="q"
          defaultValue={q}
          placeholder="Search exercises…"
          autoComplete="off"
        />
      </form>

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={qs({ mg: undefined })} className={`chip ${!mgId ? "text-accent" : "hover:text-text"}`}>
          All
        </Link>
        {muscleGroups.map((m) => (
          <Link
            key={m.id}
            href={qs({ mg: String(m.id) })}
            className="chip hover:text-text"
            style={mgId === m.id ? { borderColor: mgColor(m.name), color: mgColor(m.name) } : undefined}
          >
            <MgDot color={mgColor(m.name)} />
            {m.name}
          </Link>
        ))}
      </div>

      <div className="card divide-y divide-line/60">
        {exercises.map((e) => (
          <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-3">
              <MgDot color={mgColor(e.muscleGroup.name)} />
              <span className="text-sm">{e.name}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span>{e.exerciseType}</span>
              {e.youtubeId && (
                <a
                  href={`https://www.youtube.com/watch?v=${e.youtubeId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  video<ExternalLink aria-hidden size={13} />
                </a>
              )}
            </div>
          </div>
        ))}
        {exercises.length === 0 && <div className="px-4 py-8 text-center text-muted">No matches.</div>}
      </div>
    </>
  );
}
