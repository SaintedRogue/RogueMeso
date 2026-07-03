-- On-watch HR recorder, phase R1 (docs/superpowers/specs/2026-07-02-hr-recorder-design.md).
-- Recorder samples are day-agnostic (matched to sessions at read time by time window),
-- so HrSample.dayId relaxes to nullable; per-user beacon tokens replace the spike's
-- env token — only the sha256 is stored.

-- AlterTable
ALTER TABLE "HrSample" ALTER COLUMN "dayId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "zeppTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_zeppTokenHash_key" ON "User"("zeppTokenHash");
