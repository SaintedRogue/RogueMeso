# Feature seam

Add your own features here without touching the core. The app is structured so each
extension point is small and isolated:

## Where things live (extension points)

| You want to… | Do this |
|---|---|
| Store new data | Add a model in `prisma/schema.prisma`, run `npx prisma migrate dev`. Existing free-form fields already exist: `MesoDay.notes`, `DayExercise.jointPain`, `Mesocycle.notes`, `Exercise.notes`. |
| Add a screen | New folder under `src/app/(app)/…/page.tsx` (auto-protected by `src/proxy.ts`). Add a link in `src/components/Nav.tsx`. |
| Mutate data | New Server Action in a `"use server"` file. **Always start it with `await requireAuth()`** (`@/lib/auth`). Call `revalidatePath(...)` after writing. |
| Change progression math | Edit `src/lib/progression.ts` — it's pure and isolated (RIR ramp, volume by priority, weight suggestion). Nothing else needs to change. |
| Read data for a screen | Add a query to `src/lib/data.ts`. |
| Add a per-user setting | Cookie + action pattern in `src/lib/settings.ts` / `settingsActions.ts`. |

## Convention for a feature module

Put self-contained logic in `src/lib/features/<feature>.ts`, export pure functions,
and wire them from a page or action. Keep DB access through `@/lib/prisma`.

```ts
// src/lib/features/example.ts
import { prisma } from "@/lib/prisma";

export async function muscleGroupWeeklyVolume(mesoId: number, week: number) {
  const sets = await prisma.exerciseSet.findMany({
    where: { dayExercise: { day: { mesoId, week } } },
    include: { dayExercise: { include: { muscleGroup: true } } },
  });
  const byMg = new Map<string, number>();
  for (const s of sets) {
    const mg = s.dayExercise.muscleGroup.name;
    byMg.set(mg, (byMg.get(mg) ?? 0) + 1);
  }
  return [...byMg.entries()].map(([muscleGroup, sets]) => ({ muscleGroup, sets }));
}
```

Ideas to build next: weekly volume-per-muscle charts, bodyweight tracking, exercise
history graphs, PR detection, empirical progression-tuning (fit the model to your own
training logs), CSV export.
