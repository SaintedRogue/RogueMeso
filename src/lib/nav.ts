import {
  Dumbbell,
  CalendarRange,
  ListChecks,
  TrendingUp,
  LayoutTemplate,
  Gauge,
  BellRing,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  // Shown in the desktop sidebar but kept OUT of the mobile bottom bar, which can't
  // fit more than the primary tabs at 320px without breaking the 44px touch target.
  secondary?: boolean;
};

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Current workout", shortLabel: "Workout", icon: Dumbbell },
  { href: "/mesocycles", label: "Mesocycles", shortLabel: "Mesos", icon: CalendarRange },
  { href: "/exercises", label: "Exercises", shortLabel: "Exercises", icon: ListChecks },
  { href: "/insights", label: "Insights", shortLabel: "Insights", icon: TrendingUp },
  { href: "/templates", label: "Templates", shortLabel: "Templates", icon: LayoutTemplate },
  { href: "/body-tuning", label: "Body Tuning", shortLabel: "Tuning", icon: Gauge },
  { href: "/adhd-mode", label: "ADHD Mode", shortLabel: "ADHD", icon: BellRing, secondary: true },
  { href: "/profile", label: "Profile & Settings", shortLabel: "Profile", icon: Settings },
];

export const ADMIN_LINK: NavLink = { href: "/admin/users", label: "Users", shortLabel: "Users", icon: Users };

export function isActive(link: NavLink, pathname: string): boolean {
  return link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
}
