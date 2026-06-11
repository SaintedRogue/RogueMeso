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
  UsersRound,
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
  // Lives in the desktop user menu (click the name) instead of the sidebar nav list.
  // Still shown in the mobile bottom bar, which has no persistent user menu.
  inUserMenu?: boolean;
};

// Profile & Settings and admin Users moved off the desktop sidebar into the user
// menu (UserMenu). PROFILE_LINK still appears in the mobile bottom bar.
export const PROFILE_LINK: NavLink = { href: "/profile", label: "Profile & Settings", shortLabel: "Profile", icon: Settings, inUserMenu: true };
export const ADMIN_LINK: NavLink = { href: "/admin/users", label: "Users", shortLabel: "Users", icon: Users };

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Current workout", shortLabel: "Workout", icon: Dumbbell },
  { href: "/mesocycles", label: "Mesocycles", shortLabel: "Mesos", icon: CalendarRange },
  { href: "/exercises", label: "Exercises", shortLabel: "Exercises", icon: ListChecks },
  { href: "/insights", label: "Insights", shortLabel: "Insights", icon: TrendingUp },
  // secondary → kept in the desktop sidebar but OUT of the 5-slot mobile bottom bar
  // (which caps at 5 for legible labels + 44px targets). On mobile these are reached
  // via link cards on the Profile page.
  { href: "/templates", label: "Templates", shortLabel: "Templates", icon: LayoutTemplate, secondary: true },
  { href: "/body-tuning", label: "Body Tuning", shortLabel: "Tuning", icon: Gauge, secondary: true },
  { href: "/community", label: "Community", shortLabel: "Community", icon: UsersRound, secondary: true },
  { href: "/adhd-mode", label: "ADHD Mode", shortLabel: "ADHD", icon: BellRing, secondary: true },
  PROFILE_LINK,
];

export function isActive(link: NavLink, pathname: string): boolean {
  return link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
}
