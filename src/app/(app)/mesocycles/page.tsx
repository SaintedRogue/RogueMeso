import Link from "next/link";
import { getMesocycles } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { PageHeader, StatusPill, EmptyState, CardLink } from "@/components/ui";

export default async function MesocyclesPage() {
  const me = await requireUser();
  const mesos = await getMesocycles(me.id);
  return (
    <>
      <PageHeader title="Mesocycles" subtitle={`${mesos.length} training blocks`}>
        <Link href="/mesocycles/new" className="btn-primary px-3 py-2 text-sm">
          + New mesocycle
        </Link>
      </PageHeader>

      {mesos.length === 0 ? (
        <EmptyState title="No mesocycles" hint="Create one from a template to get started." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {mesos.map((m) => (
            <CardLink key={m.id} href={`/mesocycles/${m.key}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{m.name}</div>
                  <div className="mt-1 text-xs text-muted">
                    {m.weeksCount} weeks · {m.daysPerWeek} days/wk · {m.unit}
                  </div>
                </div>
                <StatusPill status={m.status} />
              </div>
            </CardLink>
          ))}
        </div>
      )}
    </>
  );
}
