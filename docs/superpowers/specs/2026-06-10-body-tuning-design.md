# Body Tuning — Design Spec

**Date:** 2026-06-10
**Status:** Approved (design), pending implementation plan
**Author:** brainstormed with Claude (deep-research backed)

## Summary

A new top-level **Body Tuning** section that turns RogueMeso's logged training data
plus weekly bodyweight check-ins into evidence-based daily **calorie + macronutrient
targets**, configurable per mesocycle (cut / bulk / maintain).

It is a **target-only** engine — no food/calorie logging. It begins with a formula
estimate when data is thin, then personalizes the maintenance estimate as weigh-ins and
training history accumulate (an **adherence-assumed adaptive controller**: the app's own
prescribed intake stands in for "what was eaten," and divergence of the smoothed weight
trend from the predicted trend corrects the maintenance estimate).

The activity component is derived from **logged training volume** (set count → estimated
session duration → MET-delta energy), not a self-reported activity questionnaire.

## Evidence base (deep-research, verified)

All coefficients below were adversarially verified (23/25 claims confirmed). Two numbers
(lean-bulk surplus rate, exact fat floor) survived only with a re-verify caveat and are
therefore captured as **named, cited constants** rather than inline magic numbers.

| Component | Choice | Coefficient / rule | Source |
|---|---|---|---|
| BMR base (default) | Ten-Haaf 2014 | `RMR = 11.936·wt_kg + 587.728·ht_m − 8.129·age + 191.027·(sex M=1,F=0) + 29.279` (ht in **meters**) | Sports Med 2023 meta-analysis, PMC10687135 |
| BMR (lean + BF% known) | Tinsley 2019 (FFM) | `RMR = 25.9·FFM_kg + 284`; FFM = wt·(1−bf) | PMC11216238 / apnm-2018-0412 |
| Training energy | Duration × MET-delta | ~5–6.5 kcal/min; full session ≈ 280–610 kcal; **driven by duration, not load** | Reis 2021 PMC8714826; 2024 Compendium PMC10818145 |
| EPOC | Not added as a bonus | Afterburn small & intensity-independent (claim refuted 0–3) | PMC8714826 |
| Adaptive correction | NIH/Hall dynamic model | fat ≈ 9400, lean ≈ 1800 kcal/kg; Forbes `F=D·e^(L/10.4)`; ~24 kcal/day per kg steady-state; ~1yr half-life ⇒ smooth + damp | Hall Lancet 2011 (PMID 21872751); Chow & Hall 2008 PMC2266991; NIH Body Weight Planner |
| Cut rate | ≤ 0.5 %BW/week | range 0.5–1.0 %/week; faster loses more FFM | Roberts/Helms 2020 PMC7052702; PMC8471721 |
| Lean-bulk rate *(re-verify)* | ~0.25–0.5 %BW/week | flagged constant | PMC7052702 (caveat) |
| Protein | 1.8–2.7 g/kg/day | push high end in a deficit | PMC7052702; ISSN PMC5477153; Longland 2016 |
| Fat floor *(re-verify)* | ~0.5–1 g/kg or 20–30% kcal | flagged constant | PMC7052702 (caveat) |
| Carbohydrate | remainder | after protein + fat | — |

## Goals

- Produce a defensible daily kcal + macro target from data RogueMeso already has, plus a
  lightweight weight check-in, without any food logging.
- Honor the research over intuition: the training term scales with **session duration
  (via set count)**, not tonnage.
- Self-personalize: formula when data is thin → blended adaptive estimate as weeks accrue.
- Keep all science in a pure, unit-tested module (mirrors `insights.ts`), so targets and
  the underlying model never drift from the cited literature.

## Non-goals

- No food / calorie / meal logging, no food database.
- No true intake-vs-weight adaptive TDEE (impossible without intake; the adherence-assumed
  loop is the substitute).
- No DEXA / lab inputs; BF% is optional and self-reported.
- No medical claims; hard safety floors prevent unsafe prescriptions.

## Placement

Dedicated top-level route `body-tuning`, chosen over embedding (mirrors the Insights
decision) for isolation and testability. Profile/biometric settings live in the existing
`profile/` screen; the active-meso goal control surfaces in Body Tuning.

## Data model (Prisma)

Three changes to `prisma/schema.prisma`. All new `User`/`Mesocycle` fields are **nullable**
so existing rows and the single-user self-host keep working.

1. **Extend `User`** with the person's biometrics (distinct from `Template.sex`):
   - `heightCm Float?`
   - `birthDate DateTime?` (age derived at calculation time)
   - `sex String?` (`"M"` | `"F"`)
   - `activityLevel String?` (`"sedentary"` | `"light"` | `"moderate"` — NEAT baseline)

2. **New `WeightEntry`** — daily-granularity check-in, engine averages to a trend:
   ```
   model WeightEntry {
     id         Int      @id @default(autoincrement())
     userId     Int
     user       User     @relation(fields: [userId], references: [id])
     date       DateTime @db.Date
     weightKg   Float
     bodyFatPct Float?
     note       String?
     createdAt  DateTime @default(now())
     @@unique([userId, date])
     @@index([userId, date])
   }
   ```
   Storage is canonical **kg**; display respects `User.unit` (lb/kg) via `format.ts`.

3. **Extend `Mesocycle`** with the per-meso goal binding:
   - `nutritionGoal String?` (`"cut"` | `"bulk"` | `"maintain"`) — **engine treats null as
     `maintain`**.
   - `targetRatePctPerWeek Float?` — optional override of the goal's default rate.

The daily target is **never stored** — it is derived on read from
`(profile, active-meso goal, latest training week, weight trend)` so it is always fresh.

## Engine — `src/lib/features/bodyTuning.ts` (pure, unit-tested)

No I/O; same shape as `insights.ts`. All tunables in one exported
`BODY_TUNING_CONSTANTS` block with inline citations + `// RE-VERIFY` markers on the two
caveated numbers.

- `estimateRMR(profile)` → Ten-Haaf by default; Tinsley FFM branch when BF% present **and**
  user is lean (threshold constant). Height converted cm→m internally.
- `estimateTrainingEnergy(weekSets, bodyweightKg)` → working-set count → estimated session
  duration (`sets × perSetMinutes` constant; later refinable from `ExerciseSet.finishedAt`
  / `MesoDay.finishedAt`) → `MET_delta × bw_kg × hours`; amortized to a **daily average**
  over the meso's training days/week.
- `estimateNEAT(profile, rmr)` → activity-level multiplier applied to the **non-training**
  baseline only (training energy is counted explicitly, so it is not double-counted in the
  activity multiplier).
- `maintenanceEstimate = RMR + NEAT + trainingEnergyDaily` — the formula tier.
- `goalAdjustedTarget(maintenance, goal, weightKg, rateOverride?)` → resolves goal→target
  %BW/week rate → surplus/deficit via Hall variable energy density.
- `macroTargets(targetKcal, weightKg, goal)` → protein first (g/kg, higher in deficit) →
  fat floor → carbohydrate = remainder.

## Adaptive controller (personalized tier)

`adaptiveMaintenance(formulaEstimate, weightHistory, prescribedKcalHistory)`:

1. **Smooth** the weight series with an EWMA (removes water/glycogen noise).
2. Compute **observed** smoothed rate vs the **predicted** rate for the prescribed intake
   (Hall model).
3. Convert the gap to a kcal error using Hall variable energy density (Forbes partition for
   fat-vs-lean split based on current leanness).
4. Apply a **damped** correction — blend a fraction (`CORRECTION_DAMPING` ≈ 0.25–0.5) of the
   error per week — so the ~1-year weight half-life plus daily noise do not cause the
   controller to oscillate.
5. **Confidence ramp**: `< MIN_WEEKS_FOR_ADAPT` (≈ 2–3) weeks of data → pure formula; blend
   the adaptive term in linearly as weeks accumulate. This is the "estimate when thin,
   personalize as data grows" requirement, made concrete.

## UI — "Body Tuning" section

- New route `src/app/(app)/body-tuning/page.tsx`; nav line in `src/lib/nav.ts`, rendered by
  `BottomBar.tsx` (mobile) and `Nav.tsx` (desktop).
- **Today's targets** card: kcal + protein / fat / carb, with a **confidence badge**
  (`formula` → `personalizing` → `personalized`).
- **Quick weigh-in**: one-tap log of today's weight (+ optional BF%), writing a
  `WeightEntry`.
- **Weight-trend chart**: reuse Recharts (as `HistoryChart`/`VolumeChart` do) — raw dots +
  EWMA trend line + goal corridor (target rate band).
- **Goal control**: cut / bulk / maintain bound to the **active** mesocycle (defaults to
  maintain), with optional rate override.
- **Biometric settings** (height / sex / birthdate / activity level) live on `profile/`.

Server Actions: new `src/lib/bodyTuningActions.ts` (log weight, set profile biometrics, set
meso goal) following the existing `settingsActions.ts` / `mesoActions.ts` patterns, scoped
to the current user via `auth.ts`.

## Testing & safety

- **TDD** on `bodyTuning.ts`: fixture tests in `bodyTuning.test.ts` (known input → known
  kcal/macros), each expected value annotated with the source it derives from.
- **Safety rails**: hard floors — never prescribe below `RMR × 1.1` nor below an
  evidence-based minimum kcal; cap per-week correction magnitude; reject implausible
  weight entries (day-over-day delta beyond `MAX_PLAUSIBLE_KG_DELTA`) from the trend.
- All constants centralized in `BODY_TUNING_CONSTANTS`; the two caveated values
  (`LEAN_BULK_RATE_PCT`, `FAT_FLOOR_G_PER_KG`) carry `// RE-VERIFY` comments so they are
  trivially tunable when re-checked against current ISSN guidance.

## Open items carried into planning

- Exact `perSetMinutes` and whether to refine session duration from `finishedAt` timestamps
  in v1 or defer.
- Final values + re-verification of `LEAN_BULK_RATE_PCT` and `FAT_FLOOR_G_PER_KG`.
- EWMA half-life and `CORRECTION_DAMPING` tuning constants.
