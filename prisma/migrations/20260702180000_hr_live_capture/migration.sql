-- Wearables: live heart-rate capture (Web Bluetooth, standard GATT Heart Rate service).
-- HrSample holds ~1 Hz readings batch-inserted during a session; MesoDay.startedAt gives
-- the capture window a left edge (stamped by the first logged set, never cleared).

-- AlterTable
ALTER TABLE "MesoDay" ADD COLUMN "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HrSample" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "dayId" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "bpm" INTEGER NOT NULL,

    CONSTRAINT "HrSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrSample_dayId_at_idx" ON "HrSample"("dayId", "at");

-- CreateIndex
CREATE INDEX "HrSample_userId_at_idx" ON "HrSample"("userId", "at");

-- AddForeignKey
ALTER TABLE "HrSample" ADD CONSTRAINT "HrSample_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrSample" ADD CONSTRAINT "HrSample_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "MesoDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
