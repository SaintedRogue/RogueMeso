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

## How this research was produced

The Body Tuning evidence base was gathered with a multi-agent deep-research pass:
the question was decomposed into 5 angles, ~22 sources were fetched, 102 candidate
claims were extracted, and 25 load-bearing claims were put through 3-vote
adversarial verification (a claim needed 2 of 3 independent agents to *refute* it
to be killed). 23 claims survived; 2 were killed. The killed claims are documented
in [body-tuning-science.md](body-tuning-science.md#rejected-claims) so we don't
re-introduce them.
