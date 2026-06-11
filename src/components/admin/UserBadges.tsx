import { roleLabel } from "@/lib/roles";

/** The admin / disabled / you chips shown beside a user, on both the list and detail pages. */
export function UserBadges({ role, active, isSelf }: { role: string; active: boolean; isSelf: boolean }) {
  return (
    <>
      {role === "admin" && (
        <span className="chip" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }}>
          {roleLabel(role).toLowerCase()}
        </span>
      )}
      {!active && (
        <span className="chip text-bad" style={{ borderColor: "var(--color-bad)" }}>
          disabled
        </span>
      )}
      {isSelf && <span className="chip">you</span>}
    </>
  );
}
