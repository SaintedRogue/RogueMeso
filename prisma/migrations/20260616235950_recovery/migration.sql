-- CreateTable
CREATE TABLE "ReadinessEntry" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "sleepHours" DOUBLE PRECISION NOT NULL,
    "soreness" INTEGER NOT NULL,
    "energy" INTEGER NOT NULL,
    "note" TEXT,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadinessEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryRoutine" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "bodyFocus" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "citation" TEXT NOT NULL,
    "guardrail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryRoutine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadinessEntry_userId_idx" ON "ReadinessEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessEntry_userId_date_key" ON "ReadinessEntry"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryRoutine_sourceId_key" ON "RecoveryRoutine"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryRoutine_key_key" ON "RecoveryRoutine"("key");

-- AddForeignKey
ALTER TABLE "ReadinessEntry" ADD CONSTRAINT "ReadinessEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
