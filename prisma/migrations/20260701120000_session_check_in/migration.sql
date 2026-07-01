-- Physical Therapy Lens: move movement-quality & symptom capture from the per-exercise grain
-- (six DayExercise columns) to a per-session Recovery/Session Check-In — one row per MesoDay,
-- split into a pre-workout half and a post-session half. The old per-exercise capture shipped
-- the same day and carried little/no real data, so its columns are dropped outright. `jointPain`
-- predates the lens and stays; `ExerciseSet.side` (the symmetry input) stays.

-- CreateTable
CREATE TABLE "SessionCheckIn" (
    "id" SERIAL NOT NULL,
    "dayId" INTEGER NOT NULL,
    "prePainScore" INTEGER,
    "prePainLocations" TEXT,
    "preNote" TEXT,
    "preSubmittedAt" TIMESTAMP(3),
    "postPainScore" INTEGER,
    "postPainLocations" TEXT,
    "postPainTiming" TEXT,
    "postRangeOfMotion" TEXT,
    "postQualityTags" TEXT,
    "postNote" TEXT,
    "postSubmittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionCheckIn_dayId_key" ON "SessionCheckIn"("dayId");

-- AddForeignKey
ALTER TABLE "SessionCheckIn" ADD CONSTRAINT "SessionCheckIn_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "MesoDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropColumn — retire the per-exercise movement & symptom capture (IF EXISTS so the migration is
-- safe even on a DB that never ran the one-day-old per-exercise migration).
ALTER TABLE "DayExercise" DROP COLUMN IF EXISTS "painScore",
DROP COLUMN IF EXISTS "painLocations",
DROP COLUMN IF EXISTS "painTiming",
DROP COLUMN IF EXISTS "rangeOfMotion",
DROP COLUMN IF EXISTS "qualityTags",
DROP COLUMN IF EXISTS "ptNote";
