"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function setDefaultUnit(formData: FormData) {
  const me = await requireUser();
  const unit = String(formData.get("unit")) === "kg" ? "kg" : "lb";
  await prisma.user.update({ where: { id: me.id }, data: { unit } });
  revalidatePath("/", "layout");
}
