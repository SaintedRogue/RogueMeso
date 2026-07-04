-- Wellness snapshot sync from the watch app: one JSONB row per on-demand snapshot
-- (sleep, stress, SpO2, activity, PAI, body temp, workouts, environment, device
-- metadata). Schema-on-read: per-domain shapes are firmware-dependent and still being
-- characterized, so ingestion bounds-checks (lib/wellness.ts) but does not normalize.

-- CreateTable
CREATE TABLE "WellnessSnapshot" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellnessSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WellnessSnapshot_userId_collectedAt_idx" ON "WellnessSnapshot"("userId", "collectedAt");

-- AddForeignKey
ALTER TABLE "WellnessSnapshot" ADD CONSTRAINT "WellnessSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
