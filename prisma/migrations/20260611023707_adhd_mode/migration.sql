-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSchedule" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "wakeHHMM" INTEGER NOT NULL DEFAULT 600,
    "bedtimeHHMM" INTEGER NOT NULL DEFAULT 2230,
    "workoutHHMM" INTEGER,
    "mealsPerDay" INTEGER NOT NULL DEFAULT 3,
    "globalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyCap" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitConfig" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "habitKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "params" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "habitKey" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "firingIndex" INTEGER NOT NULL,
    "snoozedUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSchedule_userId_key" ON "NotificationSchedule"("userId");

-- CreateIndex
CREATE INDEX "HabitConfig_userId_idx" ON "HabitConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitConfig_userId_habitKey_key" ON "HabitConfig"("userId", "habitKey");

-- CreateIndex
CREATE INDEX "ReminderLog_userId_localDate_idx" ON "ReminderLog"("userId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_userId_habitKey_localDate_firingIndex_key" ON "ReminderLog"("userId", "habitKey", "localDate", "firingIndex");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSchedule" ADD CONSTRAINT "NotificationSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitConfig" ADD CONSTRAINT "HabitConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
