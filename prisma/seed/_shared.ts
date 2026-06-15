import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { PrismaClient, type ExerciseType } from "@prisma/client";

export const prisma = new PrismaClient();

/** Where the seed data lives. Override with the SEED_DATA_DIR env var. */
export const SEED_DATA_DIR =
  process.env.SEED_DATA_DIR ?? path.join(os.homedir(), "roguemeso-seed");

export function readJson<T = unknown>(...parts: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(SEED_DATA_DIR, ...parts), "utf8")) as T;
}

export function listJson(dir: string): string[] {
  const d = path.join(SEED_DATA_DIR, dir);
  return fs.readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => path.join(d, f));
}

/** Seed data stores exerciseType as kebab values; map to our Prisma enum member names. */
const EXERCISE_TYPE_MAP: Record<string, ExerciseType> = {
  machine: "machine",
  barbell: "barbell",
  dumbbell: "dumbbell",
  cable: "cable",
  freemotion: "freemotion",
  "smith-machine": "smithMachine",
  "bodyweight-only": "bodyweightOnly",
  "bodyweight-loadable": "bodyweightLoadable",
  "machine-assistance": "machineAssistance",
  kettlebell: "kettlebell",
};

export function mapExerciseType(raw: string): ExerciseType {
  const v = EXERCISE_TYPE_MAP[raw];
  if (!v) throw new Error(`Unknown exerciseType in seed data: ${raw}`);
  return v;
}

export const MG_PRIORITY = new Set(["maintain", "grow", "emphasize"]);

/** Build sourceId -> our PK maps for reference tables. */
export async function muscleGroupMap(): Promise<Map<number, number>> {
  const rows = await prisma.muscleGroup.findMany({ select: { id: true, sourceId: true } });
  return new Map(rows.map((r) => [r.sourceId, r.id]));
}

export async function exerciseMap(): Promise<Map<number, number>> {
  const rows = await prisma.exercise.findMany({
    where: { sourceId: { not: null } },
    select: { id: true, sourceId: true },
  });
  return new Map(rows.map((r) => [r.sourceId as number, r.id]));
}
