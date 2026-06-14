import { forcePasswordChange } from "@/lib/authActions";
import { LogoMark, Wordmark } from "@/components/Brand";
import { ToastForm } from "@/components/forms";

/**
 * Full-screen gate rendered by the app layout when the signed-in user has
 * `mustChangePassword` set (after an admin password reset). No nav is rendered, so the
 * rest of the app is unreachable until they enter the temporary password and choose a
 * new one — at which point the action clears the flag and redirects home.
 */
export function ForcedPasswordChange({ name }: { name: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={44} />
          <div>
            <Wordmark size="text-2xl" />
            <p className="mt-0.5 text-xs uppercase tracking-wider text-muted/70">Set a new password</p>
          </div>
        </div>
        <ToastForm action={forcePasswordChange} submitLabel="Set password" className="card space-y-4 p-7">
          <p className="text-sm text-muted">
            Welcome{name ? `, ${name}` : ""}. Your password was set by an admin — please choose your own to continue.
          </p>
          <input
            className="input"
            type="password"
            name="currentPassword"
            placeholder="Temporary password"
            autoComplete="current-password"
            required
          />
          <input
            className="input"
            type="password"
            name="password"
            placeholder="New password (min 8)"
            autoComplete="new-password"
            required
          />
          <input
            className="input"
            type="password"
            name="confirm"
            placeholder="Confirm new password"
            autoComplete="new-password"
            required
          />
        </ToastForm>
      </div>
    </div>
  );
}
