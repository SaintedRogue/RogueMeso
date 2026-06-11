// Route Handler the service worker calls when the user taps a notification action.
// The SW sends the session cookie (credentials: "include"), so we authenticate the
// same way the rest of the app does. "snooze" defers the reminder; "done" is a no-op
// (the ReminderLog already exists, so the scheduler won't re-fire it today).
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ADHD_MODE_CONSTANTS } from "@/lib/features/adhdMode";
import { snoozeReminder } from "@/lib/features/adhdData";

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { action, habitKey, localDate, firingIndex } = (body ?? {}) as {
    action?: string;
    habitKey?: string;
    localDate?: string;
    firingIndex?: number;
  };

  if (
    action === "snooze" &&
    typeof habitKey === "string" &&
    typeof localDate === "string" &&
    Number.isInteger(firingIndex)
  ) {
    const until = new Date(Date.now() + ADHD_MODE_CONSTANTS.SNOOZE_MINUTES * 60_000);
    await snoozeReminder(me.id, habitKey, localDate, firingIndex as number, until);
  }

  // "done" needs no work; the log row already suppresses today's re-fire.
  return NextResponse.json({ ok: true });
}
