-- Physical Therapy Lens (optional, additive, backward-compatible). Every column is nullable
-- (or defaulted) so existing rows and the data export stay valid; existing users default to
-- the lens OFF. Reversible: each ADD COLUMN below can be dropped with no data transform.

-- AlterTable — the single opt-in toggle
ALTER TABLE "User" ADD COLUMN     "physicalTherapyLens" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable — editable exercise taxonomy (movement pattern + primary joints)
ALTER TABLE "Exercise" ADD COLUMN     "movementPattern" TEXT,
ADD COLUMN     "primaryJoints" TEXT;

-- AlterTable — per-exercise-in-session movement-quality & symptom capture
ALTER TABLE "DayExercise" ADD COLUMN     "painScore" INTEGER,
ADD COLUMN     "painLocations" TEXT,
ADD COLUMN     "painTiming" TEXT,
ADD COLUMN     "rangeOfMotion" TEXT,
ADD COLUMN     "qualityTags" TEXT,
ADD COLUMN     "ptNote" TEXT;

-- AlterTable — per-set side (left/right/bilateral) for the symmetry view
ALTER TABLE "ExerciseSet" ADD COLUMN     "side" TEXT;
