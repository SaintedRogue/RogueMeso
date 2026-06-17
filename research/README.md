# Research

Background research and scientific rationale behind RogueMeso features.

These documents explain *why* the numbers in the code are what they are. Each
coefficient that drives a recommendation should be traceable from here to a
named constant in the codebase, and from there to a peer-reviewed source.

## Index

- [**Body Tuning — the science**](body-tuning-science.md) — the evidence base for
  the calorie + macronutrient target engine: which equations, which coefficients,
  what was rejected, and what still needs re-verification. Maps directly to
  `BODY_TUNING_CONSTANTS` in `src/lib/features/bodyTuning.ts`.
- [**Recovery — the science**](recovery-science.md) — the evidence base for the
  Recovery hub: readiness scoring, the active-recovery / foam-rolling / mobility
  routine library, and the recovery reminders. Maps to `RECOVERY_CONSTANTS` in
  `src/lib/features/recovery.ts` and the `citation`/`guardrail` values in
  `prisma/recovery.sql`. Includes the stretching guardrail and the refuted claims.

## How this research was produced

Each evidence base was gathered with a multi-agent deep-research pass: the question
was decomposed into several angles, sources were fetched and de-duplicated, candidate
claims were extracted, and the load-bearing ones were put through 3-vote adversarial
verification (a claim needed 2 of 3 independent agents to *refute* it to be killed).
Killed claims are documented in each doc's rejected/refuted section so we don't
re-introduce them.

- **Body Tuning:** 5 angles → ~22 sources → 102 claims → 25 verified → 23 confirmed, 2 killed.
- **Recovery:** 6 angles → 26 sources → 122 claims → 25 verified → 21 confirmed, 4 killed.
