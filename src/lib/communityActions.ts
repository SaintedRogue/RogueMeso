"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isAllowedEmoji } from "@/lib/features/community";

/** Flip the current user's community participation. Opting out instantly hides them from
 *  the feed + leaderboard (queries filter communityOptIn) without deleting any history. */
export async function toggleCommunityOptIn(): Promise<void> {
  const me = await requireUser();
  // Read the current flag fresh (not the session-cached user) so the flip is based on
  // committed state, then write the inverse.
  const fresh = await prisma.user.findUniqueOrThrow({
    where: { id: me.id },
    select: { communityOptIn: true },
  });
  await prisma.user.update({
    where: { id: me.id },
    data: { communityOptIn: !fresh.communityOptIn },
  });
  revalidatePath("/community");
  revalidatePath("/profile");
  revalidatePath("/templates"); // the per-template Share control is gated on opt-in
}

async function assertTemplateOwner(key: string, userId: number) {
  const t = await prisma.template.findUnique({ where: { key }, select: { userId: true } });
  if (!t || t.userId !== userId) throw new Error("Forbidden");
}

/** Share / unshare one of your own templates with the instance. */
export async function setTemplateShared(key: string, shared: boolean): Promise<void> {
  const me = await requireUser();
  await assertTemplateOwner(key, me.id);
  await prisma.template.update({ where: { key }, data: { sharedWithInstance: shared } });
  revalidatePath("/templates");
  revalidatePath(`/templates/${key}`);
  revalidatePath("/community");
}

/** Toggle a kudos reaction on a feed item. Members must be opted in to react, and may
 *  only react to activities authored by opted-in members (i.e. things visible in the feed). */
export async function toggleReaction(activityId: number, emoji: string): Promise<void> {
  const me = await requireUser();
  if (!me.communityOptIn || !isAllowedEmoji(emoji)) return;

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { user: { select: { communityOptIn: true } } },
  });
  if (!activity?.user.communityOptIn) return;

  const existing = await prisma.reaction.findUnique({
    where: { activityId_userId_emoji: { activityId, userId: me.id, emoji } },
    select: { id: true },
  });
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({ data: { activityId, userId: me.id, emoji } });
  }
  revalidatePath("/community");
}
