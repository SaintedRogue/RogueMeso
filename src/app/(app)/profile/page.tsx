import { logout, changeMyPassword } from "@/lib/authActions";
import { setDefaultUnit } from "@/lib/settingsActions";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

export default async function ProfilePage() {
  const me = await requireUser();
  return (
    <>
      <PageHeader title="Profile & Settings" subtitle={me.role === "admin" ? "Admin · self-hosted" : "Self-hosted"} />

      <div className="max-w-lg space-y-4">
        <div className="card p-6">
          <div className="text-sm font-medium">{me.name ?? me.email}</div>
          <div className="text-xs text-muted">{me.email}</div>
        </div>

        <form action={setDefaultUnit} className="card flex items-end justify-between gap-4 p-6">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-muted">Default units</label>
            <select name="unit" defaultValue={me.unit} className="input">
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
            <p className="mt-2 text-xs text-muted">Pre-selected when creating a new mesocycle.</p>
          </div>
          <button type="submit" className="btn-primary px-4 py-2 text-sm">Save</button>
        </form>

        <form action={changeMyPassword} className="card flex items-end justify-between gap-4 p-6">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-muted">Change password</label>
            <input
              className="input"
              type="password"
              name="password"
              placeholder="New password (min 4)"
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="btn-primary px-4 py-2 text-sm">Update</button>
        </form>

        <div className="card flex items-center justify-between p-6">
          <div>
            <div className="text-sm font-medium">Session</div>
            <div className="text-xs text-muted">Signed in to this self-hosted instance.</div>
          </div>
          <form action={logout}>
            <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-bad">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
