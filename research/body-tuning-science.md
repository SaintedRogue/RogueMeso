# Body Tuning — The Science

**Status:** Evidence base for the calorie + macronutrient target engine (`src/lib/features/bodyTuning.ts`).
**Last researched:** 2026-06-10
**Verification:** 5 research angles → 22 sources fetched → 102 candidate claims → 25 adversarially verified (3-vote, kill on ≥2 refutes) → **23 confirmed, 2 killed**.

> Every coefficient below maps to a field in `BODY_TUNING_CONSTANTS`. When you change
> a number in the code, update the rationale here too — and vice-versa. The two values
> tagged **RE-VERIFY** are the only ones the research returned with a caveat.

---

## 0. What this engine is (and is not)

RogueMeso's calorie engine is **target-only** (no food logging) and **per-mesocycle**
(cut / bulk / maintain). It does two things conventional apps don't:

1. **Derives the activity term from logged training**, not a self-reported "how active
   are you" questionnaire multiplier.
2. **Self-corrects** maintenance from the weekly bodyweight trend using an
   *adherence-assumed* closed loop — the app's own prescribed intake stands in for
   "what was eaten," and when the smoothed weight trend diverges from the *predicted*
   trend, the maintenance estimate is nudged.

It is **not** a medical tool, and it is not adaptive-TDEE-by-intake-regression (that
requires food logging, which we deliberately don't have). Hard safety floors prevent
unsafe prescriptions.

---

## 1. Resting metabolic rate (the base)

**Code:** `estimateRMR()`, constants `TEN_HAAF`, `TINSLEY_FFM`, `LEAN_BF_THRESHOLD`.

### Default: Ten-Haaf & Weijs (2014)

```
RMR (kcal/24h) = 11.936·weight_kg + 587.728·height_m − 8.129·age + 191.027·(sex: M=1,F=0) + 29.279
```

This is the default for every user. In a 2023 *Sports Medicine* meta-analysis of 29
studies (1,430 athletes), Ten-Haaf was both the **most accurate and the most precise**
RMR equation across athletic populations: **80.2 % of estimates fell within ±10 %** of
measured RMR (vs 40.7–63.7 % for the alternatives), with an effect size of 0.04 and
**I² = 0 %** (no heterogeneity). It needs only age, weight, height, and sex — no DEXA.

> ⚠️ Known limitation: it underestimates in very heavy bodybuilders. Height must be in
> **meters** (the code divides `heightCm / 100`).

**Sources:**
- Sports Med 2023 meta-analysis — https://link.springer.com/article/10.1007/s40279-023-01896-z
- PMC mirror — https://pmc.ncbi.nlm.nih.gov/articles/PMC10687135/

### Lean-athlete override: Tinsley (2019), fat-free-mass based

```
RMR = 25.9·FFM_kg + 284          where FFM = weight_kg · (1 − bodyFatPct)
```

Used **only** when the user supplies a body-fat % **and** is lean
(`bodyFatPct ≤ LEAN_BF_THRESHOLD`, default M ≤ 0.15 / F ≤ 0.23). Most older equations
*underestimate* RMR in physique athletes; Tinsley was derived on n=27 with DXA-measured
FFM (r = 0.921). FFM is estimated without a DEXA via `weight·(1 − bodyFat)`.

> ⚠️ Small cohort, non-trivial error — this is why it is gated to clearly-lean users
> only, and why Ten-Haaf (zero heterogeneity) remains the safe default.

**Sources:**
- Tinsley 2019, Appl Physiol Nutr Metab — https://cdnsciencepub.com/doi/abs/10.1139/apnm-2018-0412
- PMC — https://pmc.ncbi.nlm.nih.gov/articles/PMC11216238/

### Why not just always use a fat-free-mass equation?

Because FFM-based equations show **no clear superiority** over weight/height/age
equations in athletes. Cunningham (1980, LBM-based) had a trivial effect size (0.15)
but **I² = 93 %** (huge heterogeneity). Ten-Haaf was the only equation with zero
heterogeneity, so it is the default. (See [Rejected claims](#rejected-claims).)

---

## 2. Training-driven activity term (the novel part)

**Code:** `estimateTrainingEnergyDaily()`, `estimateNEAT()`, `maintenanceEstimate()`;
constants `PER_SET_MINUTES`, `MET_RESISTANCE`, `NEAT_MULT`.

### Energy is driven by session DURATION, not load

This is the finding that shaped the whole design. We initially assumed *tonnage*
(sets × reps × load) would drive energy expenditure. The evidence says otherwise:
total session energy is driven by **duration**, and load barely moves it — measured
**low-load 6.49 vs high-load 5.27 kcal/min**. A full 8-exercise hypertrophy session
(including the EPOC afterburn) runs ≈ **280–610 kcal**.

So we estimate energy from logged data via a MET model, using **session duration
derived from set count** (the data we actually have):

```
1 MET ≈ 1 kcal/kg/hour          (1 MET ≡ 3.5 mL O₂/kg/min)
session_minutes  = weekly_sets · PER_SET_MINUTES        (PER_SET_MINUTES = 3)
weekly_training_kcal = (MET_RESISTANCE − 1) · bodyweight_kg · (session_minutes / 60)
daily_training_kcal  = weekly_training_kcal / 7
```

We use the **MET *delta* above rest** (`MET_RESISTANCE − 1`, i.e. 5.0 − 1 = 4.0), not
the gross MET, because the resting 1 MET is already counted in RMR — using the gross
value would double-count and the 1-MET convention itself overestimates resting
metabolism by 20–35 %.

`MET_RESISTANCE = 5.0` is a representative vigorous-resistance-training MET from the
2024 Adult Compendium.

### NEAT (non-exercise activity)

Structured training is counted explicitly above, so the activity multiplier only
covers **non-training** daily movement, applied as an increment on RMR:

```
NEAT_kcal = RMR · (NEAT_MULT[activityLevel] − 1)
NEAT_MULT = { sedentary: 1.2, light: 1.35, moderate: 1.5 }
```

### Putting it together

```
maintenance(formula) = RMR + NEAT + daily_training_kcal
```

**Sources:**
- Reis 2021 (n=15 trained men; energy = aerobic + anaerobic + EPOC) — https://pmc.ncbi.nlm.nih.gov/articles/PMC8714826/
- 2024 Adult Compendium of Physical Activities — https://pmc.ncbi.nlm.nih.gov/articles/PMC10818145/

> ⚠️ The per-session kcal figures come from one small study (n=15 young trained men),
> confounded by unequal session duration/tonnage — which is exactly why we model from
> **duration**, not load, and treat the absolute kcal as approximate (the adaptive
> controller corrects systematic error anyway; see §3).

---

## 3. Adherence-assumed adaptive correction

**Code:** `ewma()`, `weeklyRateKg()`, `measuredMaintenance()`, `adaptiveMaintenance()`,
`confidenceLabel()`; constants `ADAPT_ENERGY_DENSITY`, `MIN_WEEKS_FOR_ADAPT`,
`ADAPT_RAMP_WEEKS`, `MAX_BLEND`, `EWMA_ALPHA`, `MAX_PLAUSIBLE_KG_DELTA`.

### Forget the "3,500 kcal per pound" rule

Body weight responds **slowly and non-linearly** to a sustained change in intake. The
correct model is the **NIH/Hall dynamic energy-balance model** (the basis of the NIH
Body Weight Planner):

- The energy density of body-mass change is **not constant** — fat tissue ≈ **9,400
  kcal/kg**, lean tissue ≈ **1,800 kcal/kg**.
- The split between fat and lean follows **Forbes partitioning**: `F = D·e^(L/10.4)`.
- Body weight has a **half-time of ≈ 1 year** to a new steady state; at steady state
  each ~**24 kcal/day** per kg supported.

The 1-year half-life plus daily water-weight noise means a naïve single-week correction
**oscillates**. So the controller does three things:

1. **Smooth** daily weigh-ins with an EWMA (`EWMA_ALPHA = 0.25`) before computing a
   slope, and drop implausible day-over-day jumps (`MAX_PLAUSIBLE_KG_DELTA = 2.5 kg`).
2. **Infer** maintenance from the gap between prescribed and observed rate. Under the
   adherence assumption this collapses to a closed form (no intake history needed):
   ```
   measured = formulaMaintenance + (targetRateKg − observedRateKg) · ED / 7
   ```
   where `ED = ADAPT_ENERGY_DENSITY = 7700 kcal/kg`. A fixed ED is acceptable *here*
   because the loop re-measures every week and converges; the half-life concern is
   handled by smoothing + damping, not by a perfect single-shot density.
3. **Damp and ramp**: blend toward `measured` by at most `MAX_BLEND = 0.5` per update,
   and only after `MIN_WEEKS_FOR_ADAPT = 3` weeks, ramping confidence to full over
   `ADAPT_RAMP_WEEKS = 6`. Below 3 weeks the engine is pure-formula. The confidence
   badge (`formula` → `personalizing` → `personalized`) is kept in lockstep with
   whether adaptation actually fired.

**Sources:**
- Hall et al., *Lancet* 2011 (PMID 21872751) — https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(11)60812-X/abstract
- Chow & Hall 2008 — https://pmc.ncbi.nlm.nih.gov/articles/PMC2266991/
- NIH Body Weight Planner — https://www.niddk.nih.gov/research-funding/at-niddk/labs-branches/laboratory-biological-modeling/integrative-physiology-section/research/body-weight-planner

---

## 4. Goal-based surplus / deficit

**Code:** `goalRateKgPerWeek()`, `goalAdjustedTarget()`; constants `CUT_RATE_PCT`,
`LEAN_BULK_RATE_PCT`, `ED_CUT`, `ED_BULK`, `MIN_KCAL_FLOOR`, `RMR_FLOOR_MULT`.

### Cut: ≤ 0.5 % bodyweight per week

`CUT_RATE_PCT = 0.005`. To **minimize fat-free-mass loss**, target weight loss at most
**0.5 % of body mass per week** (working range 0.5–1.0 %). In the cited review, lean
"placers" lost ≈ 0.46 %/week; faster rates lose proportionally more FFM.

**Sources:**
- Roberts, Helms, Trexler, Fitschen 2020 — https://pmc.ncbi.nlm.nih.gov/articles/PMC7052702/
- Murphy & Koehler 2021 — https://pmc.ncbi.nlm.nih.gov/articles/PMC8471721/

### Lean bulk: ~0.25–0.5 % bodyweight per week  🔶 RE-VERIFY

`LEAN_BULK_RATE_PCT = 0.003` (≈ 0.3 %/week). This value **did not survive as an
independently verified claim** — it rests on the same review's discussion rather than a
confirmed figure. Treat 0.0025–0.005 as the defensible band and re-check against current
guidance before hardcoding anything tighter. It is intentionally isolated as a named
constant with a `// RE-VERIFY` tag in the code.

### Converting a rate to a calorie offset

```
rateKg     = goalRateKgPerWeek(goal, weight)        // signed: negative = cut
ED         = rateKg < 0 ? ED_CUT (7700) : ED_BULK (5500)
dailyDelta = rateKg · ED / 7
target     = maintenance + dailyDelta
```

Two **forward-prescription** energy densities are used (a pragmatic linearization):
`ED_CUT = 7700 kcal/kg` (slow cuts are fat-dominant) and `ED_BULK = 5500 kcal/kg`
(gains carry lean tissue + water, so a lower density). Systematic error in these is
absorbed by the adaptive controller (§3).

### Safety floor

```
floor  = max(MIN_KCAL_FLOOR[sex], RMR · RMR_FLOOR_MULT)   // M:1500 / F:1200, RMR×1.0
target = max(target, floor)
```

> Note: `RMR_FLOOR_MULT = 1.0`, **not 1.1**. A 1.1 multiplier would block a legitimate
> 0.5 %/week cut for lean individuals (their valid cut target can fall below RMR×1.1).
> The rule we want is "never prescribe below resting metabolism," i.e. ×1.0.

---

## 5. Macronutrient targets

**Code:** `macroTargets()`; constants `PROTEIN_G_PER_KG`, `FAT_FLOOR_G_PER_KG`,
`FAT_MIN_PCT`.

Order of operations: **protein first → fat floor → carbohydrate as the remainder.**

### Protein: 1.8–2.7 g/kg/day, higher in a deficit

`PROTEIN_G_PER_KG = { cut: 2.6, bulk: 1.8, maintain: 2.0 }`. Physique-athlete protein
sits around **1.8–2.7 g/kg** (up to ~3.1 reported for appetite/satiety in a deficit),
with the **higher end during a calorie deficit** to preserve lean mass. The Longland
2016 RCT is the headline: 2.4 g/kg in a 40 % deficit with resistance training **gained**
≈ 1.2 kg lean body mass vs 1.2 g/kg. ISSN's position stand supports 1.4–2.0 g/kg,
higher under restriction.

**Sources:**
- Roberts/Helms 2020 — https://pmc.ncbi.nlm.nih.gov/articles/PMC7052702/
- ISSN position stand — https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/

### Fat floor: ~0.5–1.0 g/kg (or ≥20 % kcal)  🔶 RE-VERIFY

```
fatKcal = max(FAT_FLOOR_G_PER_KG · weight · 9,  FAT_MIN_PCT · targetKcal)
```

`FAT_FLOOR_G_PER_KG = 0.8`, `FAT_MIN_PCT = 0.20`. The explicit fat-floor figure also
**did not survive as an independently verified claim** — re-check the 0.5–1.0 g/kg (or
20–30 % of calories) range before tightening. Tagged `// RE-VERIFY` in code.

### Carbohydrate: the remainder

```
carbKcal = max(0, targetKcal − proteinKcal − fatKcal)
```

Carbs absorb whatever calories remain after protein and fat are set — the standard
physique approach, since protein and a fat minimum are the constraints that matter.

---

## Rejected claims

These were **killed during adversarial verification** — do not reintroduce them:

1. **"FFM-based equations (Cunningham etc.) are superior to body-weight equations like
   Mifflin-St Jeor for athletes."** — Refuted 1–2. FFM equations show no clear
   superiority and carry high heterogeneity; Ten-Haaf (weight/height/age/sex) is the
   accurate, low-variance default.
   *(Source under scrutiny: https://cdnsciencepub.com/doi/abs/10.1139/apnm-2018-0412)*

2. **"EPOC ('afterburn') contributes ~10–11.5 L O₂ for 30 min post-exercise regardless
   of intensity."** — Refuted 0–3. We do **not** add a large EPOC bonus to the training
   term; the afterburn is small and not the lever it's marketed as.
   *(Source under scrutiny: https://pmc.ncbi.nlm.nih.gov/articles/PMC8714826/)*

---

## Open items / re-verification queue

- 🔶 `LEAN_BULK_RATE_PCT` — confirm the lean-bulk surplus rate (band 0.0025–0.005 %BW/wk).
- 🔶 `FAT_FLOOR_G_PER_KG` — confirm the fat minimum (0.5–1.0 g/kg or 20–30 % kcal).
- Whether to refine `PER_SET_MINUTES` / derive true session duration from
  `ExerciseSet.finishedAt` timestamps rather than a flat per-set estimate.
- Tuning `EWMA_ALPHA` and `MAX_BLEND` against real logged weigh-in data once it accrues.

---

## Source quality summary

| Angle | Primary sources |
|---|---|
| RMR equation accuracy | Sports Med 2023 meta-analysis (PMC10687135); Tinsley 2019 (PMC11216238) |
| Training energy / MET / EPOC | Reis 2021 (PMC8714826); 2024 Adult Compendium (PMC10818145) |
| Adaptive correction / dynamic model | Hall *Lancet* 2011 (PMID 21872751); Chow & Hall 2008 (PMC2266991); NIH Body Weight Planner |
| Rates of gain/loss | Roberts/Helms 2020 (PMC7052702); Murphy & Koehler 2021 (PMC8471721) |
| Macros (protein/fat/carb) | ISSN stand (PMC5477153); Longland 2016 |

Sources span 2008–2024, weighted toward post-2015 meta-analyses, position stands, and
the NIH/Hall primary literature. Secondary/practitioner sources (MacroFactor docs,
RippedBody, The Bodybuilding Dietitians) were used only for corroboration of the
weight-trend smoothing approach, never as the sole basis for a coefficient.
