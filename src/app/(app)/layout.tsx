import Link from "next/link";
import { Nav } from "@/components/Nav";
import { BottomBar } from "@/components/BottomBar";
import { LogoMark, Wordmark } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-panel/60 px-3 py-5 backdrop-blur-sm sm:flex">
        <Link href="/" className="mb-7 flex items-center gap-2.5 px-2">
          <LogoMark />
          <Wordmark />
        </Link>
        <Nav isAdmin={user.role === "admin"} />
        <div className="mt-auto px-2 pt-6">
          <div className="mb-3 border-t border-line pt-3">
            <ThemeToggle />
          </div>
          <div className="truncate text-sm font-medium">{user.name ?? user.email}</div>
          <div className="truncate text-[0.7rem] uppercase tracking-wider text-muted/70">
            {user.role === "admin" ? "Admin · self-hosted" : "Self-hosted"}
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="stagger mx-auto max-w-5xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-7 sm:px-8 sm:py-7">{children}</div>
      </main>
      <BottomBar />
    </div>
  );
}
