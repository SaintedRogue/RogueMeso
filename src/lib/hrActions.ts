"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { sanitizeBatch, type HrSamplePoint, type HrDiagEvent } from "@/lib/heartRate";

/**
 * Persist a batch of live heart-rate readings captured in the browser (Web Bluetooth,
 * HeartRateProvider flushes ~every 30s during a session). Validation is the shared pure
 * sanitizeBatch gate; rows land scoped to the session day so the intra-workout chart can
 * join them against ExerciseSet.finishedAt. No revalidate: nothing renders HrSample yet.
 */
export async function logHrBatch(dayId: number, samples: HrSamplePoint[]) {
  const me = await requireUser();
  const day = await prisma.mesoDay.findUnique({
    where: { id: dayId },
    select: { meso: { select: { userId: true } } },
  });
  if (!day || day.meso.userId !== me.id) throw new Error("Forbidden");

  const rows = sanitizeBatch(Array.isArray(samples) ? samples : [], Date.now());
  if (rows.length === 0) return { stored: 0 };

  await prisma.hrSample.createMany({
    data: rows.map((s) => ({ userId: me.id, dayId, at: new Date(s.at), bpm: s.bpm })),
  });
  return { stored: rows.length };
}

/**
 * Mirror the client's BLE connection-lifecycle events into the server log, so
 * `docker logs roguemeso | grep hr-diag` can reconstruct a flaky gym session remotely.
 * Events only (connect steps, errors, drops, reconnects) — never samples; bounded hard.
 */
export async function logHrDiag(events: HrDiagEvent[]) {
  const me = await requireUser();
  const clean = (Array.isArray(events) ? events : [])
    .slice(0, 30)
    .filter((e) => Number.isFinite(e?.at) && typeof e?.step === "string")
    .map((e) => ({
      at: new Date(e.at).toISOString(),
      step: e.step.slice(0, 60),
      ...(typeof e.detail === "string" ? { detail: e.detail.slice(0, 200) } : {}),
    }));
  if (clean.length) console.log(`[hr-diag] user=${me.id}`, JSON.stringify(clean));
  return { logged: clean.length };
}
