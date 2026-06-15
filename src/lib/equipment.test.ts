import { describe, it, expect } from "vitest";
import { EQUIPMENT_CLASSES, sortByEquipmentPreference } from "@/lib/equipment";

// Use the Prisma enum names the picker actually receives on `exerciseType`.
const ex = (name: string, exerciseType: string) => ({ name, exerciseType });

const names = (list: { name: string }[]) => list.map((e) => e.name);

describe("sortByEquipmentPreference", () => {
  it("returns the list unchanged when nothing is preferred", () => {
    const list = [ex("a", "barbell"), ex("b", "dumbbell")];
    expect(sortByEquipmentPreference(list, new Set())).toBe(list);
  });

  it("floats preferred equipment to the top, preserving catalog order within each partition", () => {
    const list = [
      ex("barbell row", "barbell"),
      ex("db curl", "dumbbell"),
      ex("cable fly", "cable"),
      ex("db press", "dumbbell"),
    ];
    expect(names(sortByEquipmentPreference(list, new Set(["dumbbell"])))).toEqual([
      "db curl",
      "db press",
      "barbell row",
      "cable fly",
    ]);
  });

  it("supports preferring multiple buckets at once", () => {
    const list = [
      ex("machine ext", "machine"),
      ex("barbell row", "barbell"),
      ex("cable fly", "cable"),
      ex("db curl", "dumbbell"),
    ];
    expect(names(sortByEquipmentPreference(list, new Set(["barbell", "dumbbell"])))).toEqual([
      "barbell row",
      "db curl",
      "machine ext",
      "cable fly",
    ]);
  });

  it("buckets the folded enum variants (smith/bodyweight) via equipClass", () => {
    const list = [
      ex("dip", "bodyweightOnly"),
      ex("smith press", "smithMachine"),
      ex("barbell bench", "barbell"),
      ex("weighted dip", "bodyweightLoadable"),
    ];
    expect(names(sortByEquipmentPreference(list, new Set(["bodyweight"])))).toEqual([
      "dip",
      "weighted dip",
      "smith press",
      "barbell bench",
    ]);
  });

  it("floats kettlebell exercises to the top when preferred", () => {
    const list = [
      ex("barbell row", "barbell"),
      ex("kb swing", "kettlebell"),
      ex("db curl", "dumbbell"),
      ex("kb goblet squat", "kettlebell"),
    ];
    expect(names(sortByEquipmentPreference(list, new Set(["kettlebell"])))).toEqual([
      "kb swing",
      "kb goblet squat",
      "barbell row",
      "db curl",
    ]);
  });

  it("exposes the coarse buckets as chips (incl. kettlebell)", () => {
    expect(EQUIPMENT_CLASSES.map((c) => c.value)).toEqual([
      "barbell",
      "dumbbell",
      "cable",
      "machine",
      "smith",
      "bodyweight",
      "kettlebell",
    ]);
  });
});
