-- DropForeignKey
ALTER TABLE "WeightEntry" DROP CONSTRAINT "WeightEntry_userId_fkey";

-- DropIndex
DROP INDEX "WeightEntry_userId_date_idx";

-- AddForeignKey
ALTER TABLE "WeightEntry" ADD CONSTRAINT "WeightEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
