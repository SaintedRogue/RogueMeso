import type { Unit } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";

/** The signed-in user's preferred default unit (per-user). */
export async function getDefaultUnit(): Promise<Unit> {
  const user = await getCurrentUser();
  return user?.unit ?? "lb";
}
