# Recovery — Evidence Reference

**Date:** 2026-06-16
**Status:** Reference (backs the shipped Recovery hub)
**Author:** deep-research backed (fan-out web search → fetch → 3-vote adversarial verification → synthesis)

## Summary

The single reference page for the **Recovery hub** (`/recovery`): the daily readiness
check-in, the curated routine library, and the ADHD-Mode recovery reminders. Every number
that drives behavior in code traces back to a row here.

The evidence was produced by the deep-research workflow: **26 sources fetched → 122 claims
extracted → top 25 adversarially verified (3 independent skeptics each) → 21 confirmed, 4
killed**. Recovery physiology is slow-moving; 2018–2025 sources remain current as of 2026.

**The one design-shaping result is negative:** static stretching does **not** reduce
muscle soreness and may *worsen* it in the first 6 hours. So stretching/yoga is framed in
the app as **mobility / range-of-motion** work only — never as a soreness or muscle-damage
remedy. That framing is enforced by the `guardrail` on every mobility routine.

This stays consistent with the codebase convention (see
[`2026-06-10-body-tuning-design.md`](./2026-06-10-body-tuning-design.md)): science lives as
**named, cited constants** next to the value it justifies, not in a doc that drifts. This
page is the index; the code is the source of truth.

## Evidence base (deep-research, verified)

Effect sizes are SMD / Hedges' g unless noted. "Vote" is the adversarial verification
result (skeptics refuting / total). "Used in" points at where the claim drives behavior.

| Claim | Effect / rule | Vote | Source(s) | Used in |
|---|---|---|---|---|
| **Active recovery** (light cardio + mobility; walking, easy cycle, **yoga**) reduces DOMS | DOMS **SMD −0.94** (large); no significant fatigue effect; benefit only in a short post-exercise window | 3–0 | PMC5932411; NSCA 2022 (lww) | `recovery.ts` `OFF_DAY_CATEGORY` + `SORENESS_WEIGHT`; `recovery.sql` `active_recovery` routines; `adhdModeRegistry.ts` `activeRecovery` |
| **Walking 10–20 min** rivals foam rolling / CWI / massage for DOMS | comparable DOMS relief, near-zero cost | (supporting) | mtntactical review (2°) | `recovery.sql` `light-active-recovery-walk` |
| **Foam rolling** after exercise reduces soreness | **g 0.47** (+6.0%), **grows with time**: immediate −0.38 → 24h −0.53 → 48h −0.77 → 72h −0.67; sprint +3.1% (g 0.34), strength +3.9% (g 0.21); **no downside** | 3–0 | PMC6465761; PubMed 39593540; S1360859220300218 | `recovery.ts` `TRAINING_DAY_CATEGORY`; `recovery.sql` `foam_rolling` routines; `adhdModeRegistry.ts` `foamRolling` |
| **Sleep extension & naps** are the most effective sleep levers | most-studied & most-effective sleep intervention (evidence base limited) | 3–0 | Springer 40798-023-00599-z; S1389945720305281 | `recovery.ts` `SLEEP_WEIGHT`; `adhdModeRegistry.ts` `sleepExtension` |
| **Modest** sleep extension is the tested dose | **+26–106 min** added sleep | 3–0 | S1389945720305281 (Vitale 2021) | `adhdModeRegistry.ts` `sleepExtension` hint; `/recovery` nudge copy |
| **Under-sleep raises perceived exertion** (the same load feels harder) | RPE **SMD 0.39** (partial sleep deprivation 0.60) | 3–0 | PMC11996801 | `recovery.ts` `SLEEP_WEIGHT: 0.45` (sleep weighted heaviest); `/recovery` sleep-extension nudge |
| Adults need **7–9 h**; athletes trend higher | consensus sleep target | (consensus) | Watson 2015, PMC4434546 | `recovery.ts` `SLEEP_FLOOR_H 5 / TARGET 8 / CEIL 9` |
| Sleep extension and active recovery are **complementary, not interchangeable** | sleep aided next-day cognition; active recovery aided autonomic + upper-body neuromuscular (n=10, acute) | 3–0 | PMC9387860 | design rationale — the hub recommends **both**, not either/or |
| **Massage** is best for *subjective* soreness/fatigue — but **not performance** | DOMS −2.26, fatigue −2.55; no significant strength/jump effect | 3–0 | PMC5932411; Davis 2020 (PMID 32426160) | context only — **not** shipped as a routine (no equipment-free self-massage protocol in v1) |
| Effective techniques collectively cut DOMS | small-to-large, **g −2.26 to −0.40** | 3–0 | PMC5932411 | framing for category copy on `/recovery` |

### Guardrail (counter-indication)

| Claim | Effect / rule | Vote | Source(s) | Used in |
|---|---|---|---|---|
| **Static stretching does NOT reduce DOMS** and may worsen it <6h | DOMS **SMD 0.15** (CI includes 0); "might even produce DOMS" early | 3–0 | PMC5932411; Cochrane CD004577 (Herbert 2011); PMC8133317 | **`recovery.sql` `guardrail` column** on every `mobility` routine; rendered by `RoutineCard.tsx`; `schema.prisma` `RecoveryRoutine` comment |

## Refuted claims (killed in verification — why we *don't* do these)

| Claim | Vote | Source | Consequence |
|---|---|---|---|
| Foam rolling produces a large, consistent **ROM/flexibility** gain (d 0.76) | 0–3 | S1360859220300218 | Foam rolling is positioned for **soreness**, not as a flexibility tool. |
| Active recovery **prevents strength loss, improves flexibility, decreases inflammation** | 0–3 | NSCA 2022 (lww) | Active recovery copy claims **soreness relief only** — no strength/inflammation claims. |
| Sleep extension is the **single highest-priority** recovery feature | 0–3 | Springer 40798-023-00599-z | Sleep is weighted heaviest in readiness but **framed as effective-not-dominant**; it is one input, not the headline. |
| Sleep hygiene / device removal / **cold-water immersion** show no effect | 1–2 | Springer 40798-023-00599-z | Not strong enough to act on either way. |

## Caveats (respected in the design)

1. **Massage** ranking is *subjective* soreness/fatigue only — presenting it as a
   performance booster would overreach (Davis 2020). Not shipped in v1.
2. **Stretching** is actively counter-indicated as a DOMS remedy → mobility/ROM framing only.
3. **Foam-rolling** effects are small and a few RCTs find no advantage over rest for *pain*
   specifically; the meta-analytic benefit is real but modest and strongest **>24h**.
4. The sleep-extension-vs-active-recovery head-to-head is a **single small trial** (n=10
   male rugby players, acute, magnitude-based-inference stats) — directional, not definitive.
5. Sleep-intervention evidence overall is **limited in high-quality studies** by its authors' own account.
6. One scope-only supporting source (a 275-study synthesis) is a **non-peer-reviewed preprint** (SportRxiv 252) — used for breadth, not as authority.
7. Most studies are in **athletes/trained populations**; extrapolation to recreational lifters is reasonable but not directly validated.
8. **Cold-water immersion is deliberately omitted** — recovery literature flags it may blunt
   hypertrophy adaptation, which matters for a mesocycle app. (Open question, not a verified
   finding — so we simply don't push it.)

## Why readiness is advisory (not auto-regulation)

The readiness score (`computeReadinessScore` in `recovery.ts`) is **informational only** and
never feeds back into `progression.ts` / programmed sets / RIR. Evidence that
self-reported-readiness auto-regulation *improves outcomes* is weak (an open question
below), so the app surfaces a signal and lets the lifter decide.

## Open questions (deferred)

- Do these effects hold for **recreational/intermediate** lifters, or are sizes specific to elite/team-sport populations?
- Optimal **dosing/timing** per modality, and how recommendations should differ on training vs off vs deload days.
- Could aggressive recovery (e.g. CWI) **blunt hypertrophy** enough to matter for volume progression?
- Does sleep/recovery-driven **auto-regulation of load** actually improve outcomes? (Until answered, readiness stays advisory.)

## Where the citations live in code

| File | What |
|---|---|
| `src/lib/features/recovery.ts` | `RECOVERY_CONSTANTS` — score weights + sleep thresholds + routine-selection rules, each cited inline |
| `src/lib/features/adhdModeRegistry.ts` | `activeRecovery` / `foamRolling` / `sleepExtension` habits — `citation:` + `hint:` per tunable param |
| `prisma/recovery.sql` | header evidence block + per-routine `citation` column + the `guardrail` string on mobility routines |
| `src/components/recovery/RoutineCard.tsx` | renders "Evidence: {citation}" + the guardrail chip |
| `src/app/(app)/recovery/page.tsx` | sleep-extension nudge shows (PMC11996801) |
| `prisma/schema.prisma` | `RecoveryRoutine` model comment documents the guardrail rationale |
| `src/lib/features/bodyTuning.ts` | sibling engine that originated this cited-constant convention |

## Sources

Primary (peer-reviewed systematic reviews / meta-analyses / RCTs):

- **PMC5932411** — Dupuy et al. 2018, *Front. Physiol.* — meta-analysis of 99 studies (DOMS/fatigue across modalities). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5932411/
- **PMC6465761** — Wiewelhove et al. 2019 — foam-rolling meta-analysis (21 studies). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6465761/
- **PubMed 39593540** — 2024 foam-rolling RCT meta-analysis (16 RCTs, time-graded). https://pubmed.ncbi.nlm.nih.gov/39593540/
- **S1360859220300218** — Hughes & Ramer 2020 — foam rolling for EIMD recovery (32 studies). https://www.sciencedirect.com/science/article/abs/pii/S1360859220300218
- **NSCA 2022 (lww)** — Strength & Conditioning Journal systematic review of active-recovery protocols. https://journals.lww.com/nsca-scj/fulltext/2022/02000/effect_of_active_recovery_protocols_on_the.5.aspx
- **Springer 40798-023-00599-z** — 2023 PRISMA review (Sports Medicine – Open), sleep interventions in athletes. https://link.springer.com/article/10.1186/s40798-023-00599-z
- **S1389945720305281** — Vitale et al. 2021, *Sleep Med. Rev.* — sleep extension in athletes. https://www.sciencedirect.com/science/article/abs/pii/S1389945720305281
- **PMC11996801** — 2025 *Front. Physiol.* meta-analysis — sleep deprivation & RPE (45 studies). https://pmc.ncbi.nlm.nih.gov/articles/PMC11996801/
- **PMC9387860** — Leduc/Skein et al. 2022, *PLoS One* — sleep extension vs active recovery crossover (n=10). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9387860/
- **PMC8133317** — 2021 stretching & DOMS meta-analysis (corroborates the guardrail). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8133317/
- **Cochrane CD004577** — Herbert et al. 2011 — stretching to prevent/reduce soreness.
- **PMC4434546** — Watson/AASM-SRS 2015 — adult sleep-duration consensus.

Supporting / secondary:

- **PMID 32426160** — Davis et al. 2020 — massage: psychological > physiological, no performance effect.
- **mtntactical** review — post-training walking vs foam rolling / CWI / massage. https://mtntactical.com/knowledge/research-review-10-20-minutes-of-post-training-walking-rivals-foam-rolling-cold-water-immersion-and-massage-for-doms-relief/
- **PMID 4068965** — Holland 1968 — early RPE/sleep corroboration.

Scope-only (not authoritative):

- **SportRxiv 252** — 275-study recovery synthesis (1940–2022). *Preprint, not peer-reviewed.* https://sportrxiv.org/index.php/server/preprint/view/252
