// Shared shape for form Server Actions that report success/failure to the client.
// Used with React's useActionState: the action returns one of these, and a client
// wrapper (ToastForm) surfaces `message` as a toast. `null` is the initial state.

export type ActionResult = { ok: boolean; message?: string } | null;

/** Success result, optionally with a confirmation message ("Saved"). */
export function ok(message = "Saved"): ActionResult {
  return { ok: true, message };
}

/** Failure result with a user-facing reason. */
export function fail(message: string): ActionResult {
  return { ok: false, message };
}
