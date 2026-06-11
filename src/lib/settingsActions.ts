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
