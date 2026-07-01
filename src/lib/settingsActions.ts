"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, type ActionResult } from "@/lib/actionResult";

export async function setDefaultUnit(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const unit = String(formData.get("unit")) === "kg" ? "kg" : "lb";
  await prisma.user.update({ where: { id: me.id }, data: { unit } });
  // The default unit only surfaces on the profile form and the new-meso form.
  revalidatePath("/profile");
  revalidatePath("/mesocycles/new");
  return ok("Units saved");
}

/** Flip the Physical Therapy Lens opt-in. OFF is the default and hides the per-exercise capture
 *  panel, the /insights/physical-therapy sub-route and its entry card. Read the flag fresh (not
 *  the session-cached user) so the flip is based on committed state, then write the inverse. */
export async function togglePhysicalTherapyLens(): Promise<void> {
  const me = await requireUser();
  const fresh = await prisma.user.findUniqueOrThrow({
    where: { id: me.id },
    select: { physicalTherapyLens: true },
  });
  await prisma.user.update({
    where: { id: me.id },
    data: { physicalTherapyLens: !fresh.physicalTherapyLens },
  });
  revalidatePath("/profile");
  revalidatePath("/insights");
  // The capture panel is gated inside the day view, which can appear under several routes —
  // revalidate the whole app tree so it reveals/hides immediately after the (rare) toggle.
  revalidatePath("/", "layout");
}
