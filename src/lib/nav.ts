export type NavLink = {
  href: string;
  label: string;
  shortLabel: string;
  icon: string;
};

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Current workout", shortLabel: "Workout", icon: "▦" },
  { href: "/mesocycles", label: "Mesocycles", shortLabel: "Mesos", icon: "▤" },
  { href: "/exercises", label: "Exercises", shortLabel: "Exercises", icon: "✦" },
  { href: "/insights", label: "Insights", shortLabel: "Insights", icon: "▲" },
  { href: "/templates", label: "Templates", shortLabel: "Templates", icon: "❏" },
  { href: "/profile", label: "Profile & Settings", shortLabel: "Profile", icon: "◍" },
];

export const ADMIN_LINK: NavLink = { href: "/admin/users", label: "Users", shortLabel: "Users", icon: "⬡" };

export function isActive(link: NavLink, pathname: string): boolean {
  return link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
}
