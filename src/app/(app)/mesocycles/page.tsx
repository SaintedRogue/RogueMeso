import Link from "next/link";
import { CalendarRange, Plus } from "lucide-react";
import { getMesocycles } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { PageHeader, StatusPill, EmptyState, CardLink } from "@/components/ui";

export default async function MesocyclesPage() {
  const me = await requireUser();
  const mesos = await getMesocycles(me.id);
  return (
    <>
      <PageHeader title="Mesocycles" subtitle={`${mesos.length} training blocks`}>
        <Link href="/mesocycles/new" className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm">
          <Plus aria-hidden size={16} strokeWidth={2.5} />New mesocycle
        </Link>
      </PageHeader>

      {mesos.length === 0 ? (
        <EmptyState icon={CalendarRange} title="No mesocycles" hint="Create one from a template to get started." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {mesos.map((m) => (
            <CardLink key={m.id} href={`/mesocycles/${m.key}`}>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-panel-2 text-muted">
                  <CalendarRange aria-hidden size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="truncate font-semibold">{m.name}</div>
                    <StatusPill status={m.status} />
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {m.weeksCount} weeks · {m.daysPerWeek} days/wk · {m.unit}
                  </div>
                </div>
              </div>
            </CardLink>
          ))}
        </div>
      )}
    </>
  );
}
