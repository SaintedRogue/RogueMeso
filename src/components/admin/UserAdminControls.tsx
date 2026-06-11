"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shield, ShieldOff, UserX, UserCheck, KeyRound, Trash2 } from "lucide-react";
import { setUserRole, setUserActive, resetUserPassword, deleteUser } from "@/lib/userActions";
import { toast } from "@/components/Toaster";
import type { ActionResult } from "@/lib/actionResult";

type Props = {
  userId: number;
  role: string;
  active: boolean;
  isSelf: boolean;
  label: string; // name or email, for prompts/confirms
};

/**
 * Imperative admin controls for one user: role toggle, (de)activate, password reset,
 * delete. These fire programmatic Server Actions (not form submits), so they use
 * useTransition and surface the returned ActionResult as a toast. Self-targeted
 * destructive actions are hidden/disabled; the server enforces the same rules plus the
 * last-admin guard, so the UI is a convenience, not the security boundary.
 */
export function UserAdminControls({ userId, role, active, isSelf, label }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const res = await fn();
      if (res) toast(res.message ?? (res.ok ? "Done" : "Something went wrong"), res.ok ? "success" : "error");
    });

  const onDelete = () =>
    start(async () => {
      const res = await deleteUser(userId);
      if (res?.ok) {
        toast(res.message ?? "User deleted", "success");
        router.push("/admin/users"); // detail page no longer exists — return to the list
      } else if (res) {
        toast(res.message ?? "Something went wrong", "error");
      }
    });

  const nextRole = role === "admin" ? "user" : "admin";

  return (
    <div className="card space-y-4 p-5">
      <div className="text-sm font-semibold">Admin actions</div>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={pending || isSelf}
          onClick={() => run(() => setUserRole(userId, nextRole))}
          className="chip chip-nav inline-flex items-center gap-1.5 hover:border-accent/50 hover:text-text disabled:opacity-50"
        >
          {role === "admin" ? <ShieldOff size={14} /> : <Shield size={14} />}
          {role === "admin" ? "Demote to member" : "Promote to admin"}
        </button>

        <button
          disabled={pending || isSelf}
          onClick={() => run(() => setUserActive(userId, !active))}
          className="chip chip-nav inline-flex items-center gap-1.5 hover:border-accent/50 hover:text-text disabled:opacity-50"
        >
          {active ? <UserX size={14} /> : <UserCheck size={14} />}
          {active ? "Deactivate" : "Reactivate"}
        </button>

        <button
          disabled={pending}
          onClick={() => {
            const p = prompt(`New temporary password for ${label} (min 8 chars):`);
            if (p) run(() => resetUserPassword(userId, p));
          }}
          className="chip chip-nav inline-flex items-center gap-1.5 hover:border-accent/50 hover:text-text disabled:opacity-50"
        >
          <KeyRound size={14} />
          Reset password
        </button>
      </div>

      {isSelf && (
        <p className="text-xs text-muted">You can&apos;t change your own role or status — ask another admin.</p>
      )}

      {!isSelf && (
        <div className="border-t border-line/60 pt-4">
          <button
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete ${label} and ALL their data? This cannot be undone.`)) onDelete();
            }}
            className="chip chip-nav inline-flex items-center gap-1.5 text-bad hover:border-bad disabled:opacity-50"
            style={{ borderColor: "color-mix(in oklab, var(--color-bad) 40%, transparent)" }}
          >
            <Trash2 size={14} />
            Delete user
          </button>
        </div>
      )}
    </div>
  );
}
