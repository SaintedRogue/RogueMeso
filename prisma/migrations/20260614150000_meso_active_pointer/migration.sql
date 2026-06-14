-- AlterTable: explicit single-active pointer for mesocycles (getActiveMeso prefers it).
ALTER TABLE "Mesocycle" ADD COLUMN "activeAt" TIMESTAMP(3);
