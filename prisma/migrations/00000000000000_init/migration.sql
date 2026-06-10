-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('machine', 'barbell', 'dumbbell', 'cable', 'freemotion', 'smith-machine', 'bodyweight-only', 'bodyweight-loadable', 'machine-assistance');

-- CreateEnum
CREATE TYPE "MgPriority" AS ENUM ('maintain', 'grow', 'emphasize');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('lb', 'kg');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "unit" "Unit" NOT NULL DEFAULT 'lb',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuscleGroup" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "MuscleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER,
    "name" TEXT NOT NULL,
    "muscleGroupId" INTEGER NOT NULL,
    "exerciseType" "ExerciseType" NOT NULL,
    "youtubeId" TEXT,
    "notes" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emphasis" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "frequency" INTEGER,
    "sourceTemplateId" INTEGER,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateDay" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "TemplateDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSlot" (
    "id" SERIAL NOT NULL,
    "templateDayId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "muscleGroupId" INTEGER NOT NULL,
    "exerciseId" INTEGER,

    CONSTRAINT "TemplateSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplatePriority" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "muscleGroupId" INTEGER NOT NULL,
    "priority" "MgPriority" NOT NULL,

    CONSTRAINT "TemplatePriority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesocycle" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER,
    "key" TEXT NOT NULL,
    "userId" INTEGER,
    "name" TEXT NOT NULL,
    "daysPerWeek" INTEGER NOT NULL,
    "weeksCount" INTEGER NOT NULL,
    "unit" "Unit" NOT NULL DEFAULT 'lb',
    "microRirs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "generatedFrom" TEXT,
    "sourceTemplateId" INTEGER,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mesocycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesoPriority" (
    "id" SERIAL NOT NULL,
    "mesoId" INTEGER NOT NULL,
    "muscleGroupId" INTEGER NOT NULL,
    "priority" "MgPriority" NOT NULL,

    CONSTRAINT "MesoPriority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesoDay" (
    "id" SERIAL NOT NULL,
    "mesoId" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "bodyweight" DOUBLE PRECISION,
    "bodyweightUnit" TEXT,
    "notes" TEXT,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MesoDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayExercise" (
    "id" SERIAL NOT NULL,
    "dayId" INTEGER NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "muscleGroupId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "jointPain" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "DayExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseSet" (
    "id" SERIAL NOT NULL,
    "dayExerciseId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "setType" TEXT NOT NULL DEFAULT 'regular',
    "weight" DOUBLE PRECISION,
    "weightTarget" DOUBLE PRECISION,
    "weightTargetMin" DOUBLE PRECISION,
    "weightTargetMax" DOUBLE PRECISION,
    "reps" INTEGER,
    "repsTarget" INTEGER,
    "rir" INTEGER,
    "bodyweight" DOUBLE PRECISION,
    "unit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendingWeight',
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ExerciseSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MuscleGroup_sourceId_key" ON "MuscleGroup"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "MuscleGroup_name_key" ON "MuscleGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_sourceId_key" ON "Exercise"("sourceId");

-- CreateIndex
CREATE INDEX "Exercise_muscleGroupId_idx" ON "Exercise"("muscleGroupId");

-- CreateIndex
CREATE INDEX "Exercise_name_idx" ON "Exercise"("name");

-- CreateIndex
CREATE INDEX "Exercise_userId_idx" ON "Exercise"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_sourceId_key" ON "Template"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_key_key" ON "Template"("key");

-- CreateIndex
CREATE INDEX "Template_userId_idx" ON "Template"("userId");

-- CreateIndex
CREATE INDEX "TemplateDay_templateId_idx" ON "TemplateDay"("templateId");

-- CreateIndex
CREATE INDEX "TemplateSlot_templateDayId_idx" ON "TemplateSlot"("templateDayId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplatePriority_templateId_muscleGroupId_key" ON "TemplatePriority"("templateId", "muscleGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Mesocycle_sourceId_key" ON "Mesocycle"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Mesocycle_key_key" ON "Mesocycle"("key");

-- CreateIndex
CREATE INDEX "Mesocycle_userId_idx" ON "Mesocycle"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MesoPriority_mesoId_muscleGroupId_key" ON "MesoPriority"("mesoId", "muscleGroupId");

-- CreateIndex
CREATE INDEX "MesoDay_mesoId_week_position_idx" ON "MesoDay"("mesoId", "week", "position");

-- CreateIndex
CREATE INDEX "DayExercise_dayId_idx" ON "DayExercise"("dayId");

-- CreateIndex
CREATE INDEX "ExerciseSet_dayExerciseId_idx" ON "ExerciseSet"("dayExerciseId");

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_muscleGroupId_fkey" FOREIGN KEY ("muscleGroupId") REFERENCES "MuscleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateDay" ADD CONSTRAINT "TemplateDay_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSlot" ADD CONSTRAINT "TemplateSlot_templateDayId_fkey" FOREIGN KEY ("templateDayId") REFERENCES "TemplateDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSlot" ADD CONSTRAINT "TemplateSlot_muscleGroupId_fkey" FOREIGN KEY ("muscleGroupId") REFERENCES "MuscleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSlot" ADD CONSTRAINT "TemplateSlot_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplatePriority" ADD CONSTRAINT "TemplatePriority_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplatePriority" ADD CONSTRAINT "TemplatePriority_muscleGroupId_fkey" FOREIGN KEY ("muscleGroupId") REFERENCES "MuscleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesocycle" ADD CONSTRAINT "Mesocycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesoPriority" ADD CONSTRAINT "MesoPriority_mesoId_fkey" FOREIGN KEY ("mesoId") REFERENCES "Mesocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesoPriority" ADD CONSTRAINT "MesoPriority_muscleGroupId_fkey" FOREIGN KEY ("muscleGroupId") REFERENCES "MuscleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesoDay" ADD CONSTRAINT "MesoDay_mesoId_fkey" FOREIGN KEY ("mesoId") REFERENCES "Mesocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayExercise" ADD CONSTRAINT "DayExercise_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "MesoDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayExercise" ADD CONSTRAINT "DayExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayExercise" ADD CONSTRAINT "DayExercise_muscleGroupId_fkey" FOREIGN KEY ("muscleGroupId") REFERENCES "MuscleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSet" ADD CONSTRAINT "ExerciseSet_dayExerciseId_fkey" FOREIGN KEY ("dayExerciseId") REFERENCES "DayExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

