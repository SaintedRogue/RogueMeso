// Next.js 16 instrumentation hook — runs once when the server process boots. We use it
// to start the in-process reminder scheduler (src/lib/scheduler.ts). The Node.js-runtime
// guard keeps it out of the Edge runtime, and the dynamic import keeps Prisma/web-push
// out of any edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startReminderScheduler } = await import("./lib/scheduler");
  startReminderScheduler();
}
