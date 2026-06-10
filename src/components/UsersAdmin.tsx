"use client";

import { useTransition } from "react";
import { createUser, resetUserPassword, deleteUser } from "@/lib/userActions";

type U = { id: number; email: string; name: string | null; role: string };

export function UsersAdmin({ users, meId }: { users: U[]; meId: number }) {
  const [pending, start] = useTransition();

  return (
    <div className="max-w-2xl space-y-4">
      <form action={createUser} className="card space-y-3 p-5">
        <div className="text-sm font-semibold">Add a user</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input" name="email" type="email" placeholder="Email" required autoComplete="off" />
          <input className="input" name="name" placeholder="Name (optional)" autoComplete="off" />
        </div>
        <input className="input" name="password" type="text" placeholder="Temporary password (min 8)" required autoComplete="off" />
        <button type="submit" className="btn-primary px-4 py-2 text-sm">Create user</button>
      </form>

      <div className="card divide-y divide-line/60">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{u.name ?? u.email}</span>
                {u.role === "admin" && (
                  <span className="chip" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }}>
                    admin
                  </span>
                )}
                {u.id === meId && <span className="chip">you</span>}
              </div>
              <div className="truncate text-xs text-muted">{u.email}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                disabled={pending}
                onClick={() => {
                  const p = prompt(`New password for ${u.email} (min 8 chars):`);
                  if (p) start(() => resetUserPassword(u.id, p));
                }}
                className="chip chip-nav hover:border-accent/50 hover:text-text disabled:opacity-50"
              >
                Reset password
              </button>
              {u.id !== meId && (
                <button
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Delete ${u.email} and ALL their data? This cannot be undone.`)) {
                      start(() => deleteUser(u.id));
                    }
                  }}
                  className="chip chip-nav text-bad hover:border-bad disabled:opacity-50"
                  style={{ borderColor: "color-mix(in oklab, var(--color-bad) 40%, transparent)" }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
