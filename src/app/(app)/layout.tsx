import Link from "next/link";
import { Nav } from "@/components/Nav";
import { BottomBar } from "@/components/BottomBar";
import { LogoMark, Wordmark } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { ForcedPasswordChange } from "@/components/ForcedPasswordChange";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Admin-forced reset: lock the whole app behind a password change until it's done.
  if (user.mustChangePassword) return <ForcedPasswordChange name={user.name ?? user.email} />;
  return (
    <div className="flex min-h-screen">
      {/* sticky + h-dvh keeps the rail viewport-height so its footer stays pinned to
          the bottom of the screen — only <main> scrolls, not the whole row. */}
      <aside className="app-sidebar sticky top-0 hidden h-dvh w-60 shrink-0 flex-col self-start overflow-y-auto border-r border-line bg-panel/60 px-3 py-5 backdrop-blur-sm sm:flex">
        <Link href="/" className="mb-7 flex items-center gap-2.5 px-2">
          <LogoMark />
          <Wordmark />
        </Link>
        <Nav />
        <div className="mt-auto px-2 pt-6">
          <div className="mb-3 border-t border-line pt-3">
            <ThemeToggle />
          </div>
          <UserMenu name={user.name ?? user.email} isAdmin={user.role === "admin"} />
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="stagger mx-auto max-w-5xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-7 sm:px-8 sm:py-7">{children}</div>
      </main>
      <BottomBar />
    </div>
  );
}
