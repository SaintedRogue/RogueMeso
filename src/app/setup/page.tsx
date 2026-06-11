import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createFirstAdmin } from "@/lib/authActions";
import { prisma } from "@/lib/prisma";
import { LogoMark, Wordmark } from "@/components/Brand";

const ERRORS: Record<string, string> = {
  email: "Enter a valid email address.",
  mismatch: "Passwords don't match.",
  weak: "Password must be 8–72 characters.",
  taken: "That email is already in use.",
};

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await connection(); // per-request DB state — keep out of prerendering
  // First-run only: once any account exists, setup is closed.
  if ((await prisma.user.count()) > 0) redirect("/login");
  const { err } = await searchParams;

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={44} />
          <div>
            <Wordmark size="text-2xl" />
            <p className="mt-0.5 text-xs uppercase tracking-wider text-muted/70">Set up your instance</p>
          </div>
        </div>
        <form action={createFirstAdmin} className="card space-y-4 p-7">
          <p className="text-sm text-muted">Create the first account. This admin can add others later.</p>
          <input className="input" name="name" placeholder="Name (optional)" autoComplete="name" />
          <input className="input" type="email" name="email" placeholder="Email" required autoFocus autoComplete="username" />
          <input
            className="input"
            type="password"
            name="password"
            placeholder="Password (min 8)"
            required
            autoComplete="new-password"
          />
          <input
            className="input"
            type="password"
            name="confirm"
            placeholder="Confirm password"
            required
            autoComplete="new-password"
          />
          {err && <p className="text-sm text-bad">{ERRORS[err] ?? "Something went wrong."}</p>}
          <button type="submit" className="btn-primary w-full px-4 py-2.5 text-sm">
            Create admin &amp; continue
          </button>
        </form>
      </div>
    </div>
  );
}
