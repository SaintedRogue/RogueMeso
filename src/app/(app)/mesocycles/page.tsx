import Link from "next/link";
import { CalendarRange, Plus } from "lucide-react";
import { getMesocycles } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { PageHeader, StatusPill, ActiveBadge, EmptyState } from "@/components/ui";
import { MesoMenu } from "@/components/MesoMenu";

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
            <div
              key={m.id}
              className="card relative p-4 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:bg-panel-2/40"
            >
              {/* The card body navigates; the ⋮ menu sits above it so its taps don't follow the link. */}
              <Link href={`/mesocycles/${m.key}`} className="block">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-panel-2 text-muted">
                    <CalendarRange aria-hidden size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 pr-10">
                      <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
                      {m.activeAt && <ActiveBadge />}
                      <StatusPill status={m.status} />
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {m.weeksCount} weeks · {m.daysPerWeek} days/wk · {m.unit}
                    </div>
                  </div>
                </div>
              </Link>
              <div className="absolute right-2 top-2">
                <MesoMenu mesoKey={m.key} name={m.name} status={m.status} isActive={m.activeAt != null} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
