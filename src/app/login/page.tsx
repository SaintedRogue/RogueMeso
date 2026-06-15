import { connection } from "next/server";
import { redirect } from "next/navigation";
import { login } from "@/lib/authActions";
import { prisma } from "@/lib/prisma";
import { LogoMark, Wordmark } from "@/components/Brand";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; retry?: string }>;
}) {
  // The user-count query is per-request DB state, not build-time — exclude it from
  // prerendering (this Next prefers connection() over `export const dynamic`).
  await connection();
  // Fresh deploy with no accounts yet → first-run setup instead of a dead login.
  if ((await prisma.user.count()) === 0) redirect("/setup");
  const { error, retry } = await searchParams;
  const retrySecs = Number(retry);
  const lockedMsg =
    Number.isFinite(retrySecs) && retrySecs > 0
      ? `Too many attempts. Try again in about ${Math.ceil(retrySecs / 60)} min.`
      : "Too many attempts. Try again shortly.";
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={44} />
          <div>
            <Wordmark size="text-2xl" />
            <p className="mt-0.5 text-xs uppercase tracking-wider text-muted/70">Self-hosted training</p>
          </div>
        </div>
        <form action={login} className="card space-y-4 p-7">
          <p className="text-sm text-muted">Sign in to continue.</p>
          <input
            className="input"
            type="email"
            name="email"
            placeholder="Email"
            autoFocus
            autoComplete="username"
          />
          <input
            className="input"
            type="password"
            name="password"
            placeholder="Password"
            autoComplete="current-password"
          />
          {error === "disabled" ? (
            <p className="text-sm text-bad">This account has been deactivated. Contact an admin.</p>
          ) : error === "locked" ? (
            <p className="text-sm text-bad">{lockedMsg}</p>
          ) : (
            error && <p className="text-sm text-bad">Incorrect password.</p>
          )}
          <button type="submit" className="btn-primary w-full px-4 py-2.5 text-sm">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
