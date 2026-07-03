"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateBeaconToken, hashBeaconToken } from "@/lib/wearableTokens";

/**
 * Mint (or replace) the caller's beacon token. Returns the plaintext exactly once —
 * only the hash is stored, so this is the user's single chance to copy it into the
 * watch app's settings. Regenerating invalidates the previous token immediately.
 */
export async function generateZeppToken(): Promise<{ token: string }> {
  const me = await requireUser();
  const token = generateBeaconToken();
  await prisma.user.update({ where: { id: me.id }, data: { zeppTokenHash: hashBeaconToken(token) } });
  return { token };
}

/** Cut the watch off: the next beacon request 401s until a new token is pasted. */
export async function revokeZeppToken(): Promise<void> {
  const me = await requireUser();
  await prisma.user.update({ where: { id: me.id }, data: { zeppTokenHash: null } });
}
