import { login } from "@/lib/authActions";
import { LogoMark, Wordmark } from "@/components/Brand";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
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
          {error && <p className="text-sm text-bad">Incorrect password.</p>}
          <button type="submit" className="btn-primary w-full px-4 py-2.5 text-sm">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
