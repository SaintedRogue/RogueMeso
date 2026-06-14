"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { currentVersion } from "@/lib/changelog";

/**
 * Record the running version as seen by the current user, clearing the "What's new" badge.
 * Called when the user opens the panel and to baseline a brand-new user (so they don't get
 * the whole repo history on first load). No-op when there's no baked changelog (dev builds).
 *
 * Note: no revalidatePath. The client clears the badge optimistically, and the next layout
 * render (on navigation/reload) reflects the persisted state. Revalidating here would
 * re-render the panel as "caught up" and wipe the list the moment the user opened it.
 */
export async function markUpdatesSeen() {
  const version = await currentVersion();
  if (!version) return;

  const me = await requireUser();
  if (me.lastSeenVersion === version) return; // already current — skip the write.

  await prisma.user.update({ where: { id: me.id }, data: { lastSeenVersion: version } });
}
