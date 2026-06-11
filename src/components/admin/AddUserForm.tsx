import { createUser } from "@/lib/userActions";
import { ToastForm } from "@/components/forms";

/** Admin "add a member" form. The new user gets a temp password and is forced to set
 *  their own on first login (see createUser). */
export function AddUserForm() {
  return (
    <ToastForm action={createUser} submitLabel="Create user" className="card space-y-3 p-5">
      <div className="text-sm font-semibold">Add a user</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input" name="email" type="email" placeholder="Email" required autoComplete="off" />
        <input className="input" name="name" placeholder="Name (optional)" autoComplete="off" />
      </div>
      <input
        className="input"
        name="password"
        type="text"
        placeholder="Temporary password (min 8)"
        required
        autoComplete="off"
      />
      <p className="text-xs text-muted">They&apos;ll be asked to set their own password at first sign-in.</p>
    </ToastForm>
  );
}
