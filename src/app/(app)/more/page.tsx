import {
  BellRing,
  ChevronRight,
  Gauge,
  HeartPulse,
  LayoutTemplate,
  Settings,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader, CardLink } from "@/components/ui";

// The mobile bottom bar's 5th tab: every destination that doesn't fit the 5-slot bar,
// as first-class cards (nav-hierarchy: primary = tabs, secondary = hub). Previously
// these were buried inside the Profile page, which conflated "my settings" with
// "the rest of the app". Desktop reaches all of these via the sidebar/user menu, but
// the page works there too — deep links stay valid everywhere.

function SectionLink({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  hint: string;
}) {
  return (
    <CardLink href={href}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon aria-hidden size={18} className="shrink-0 text-accent" />
          <div>
            <div className="text-sm font-medium">{label}</div>
            <div className="text-xs text-muted">{hint}</div>
          </div>
        </div>
        <ChevronRight aria-hidden size={18} className="shrink-0 text-muted" />
      </div>
    </CardLink>
  );
}

export default async function MorePage() {
  const me = await requireUser();
  return (
    <>
      <PageHeader title="More" subtitle="Everything beyond the main tabs" />
      <div className="max-w-lg space-y-4">
        <SectionLink
          href="/templates"
          icon={LayoutTemplate}
          label="Templates"
          hint="Browse the program template catalog."
        />
        <SectionLink
          href="/body-tuning"
          icon={Gauge}
          label="Body Tuning"
          hint="Log weigh-ins and set calorie & macro targets."
        />
        <SectionLink
          href="/recovery"
          icon={HeartPulse}
          label="Recovery"
          hint="Readiness check-ins & active-recovery routines."
        />
        <SectionLink
          href="/community"
          icon={UsersRound}
          label="Community"
          hint="Feed, leaderboard & shared templates."
        />
        <SectionLink
          href="/adhd-mode"
          icon={BellRing}
          label="ADHD Mode"
          hint="Push reminders for workouts, meals, hydration & more."
        />
        <SectionLink
          href="/profile"
          icon={Settings}
          label="Profile & Settings"
          hint={`${me.name ?? me.email} · units, wearables, appearance & account.`}
        />
        {me.role === "admin" && (
          <SectionLink
            href="/admin/users"
            icon={Users}
            label="User management"
            hint="Add or remove household members."
          />
        )}
      </div>
    </>
  );
}
