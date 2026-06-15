-- AlterEnum
-- Additive: a new equipment value. Not referenced within this migration, so the
-- "can't use a new enum value in the same transaction" caveat does not apply.
ALTER TYPE "ExerciseType" ADD VALUE 'kettlebell';

-- AlterTable: optional template metadata (lightweight protocol notes + per-day label).
ALTER TABLE "Template" ADD COLUMN "description" TEXT;
ALTER TABLE "TemplateDay" ADD COLUMN "label" TEXT;
