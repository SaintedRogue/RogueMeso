-- Curated Recovery routine library. Hand-authored idempotent additive seed
-- (ON CONFLICT ("sourceId") DO NOTHING), applied on every boot by docker-entrypoint.sh
-- so routines reach fresh AND existing DBs (the gated seed-data.sql only loads an empty DB).
-- sourceId band: recovery routines 920000-929999.
--
-- Evidence base (full reference: docs/superpowers/specs/2026-06-16-recovery-evidence.md):
--   active_recovery — light movement cuts DOMS SMD -0.94; walking 10-20 min rivals foam
--     rolling (PMC5932411; NSCA 2022).
--   foam_rolling    — small soreness benefit g=0.47 that grows from 24h, no downside
--     (PMC6465761; PubMed39593540).
--   mobility        — GUARDRAIL: static stretching does NOT reduce DOMS and may worsen it
--     under 6h (PMC5932411; Cochrane CD004577). Framed as range-of-motion work only.

-- ===== Active recovery =====
INSERT INTO public."RecoveryRoutine" ("sourceId", "key", name, category, "durationMin", "bodyFocus", steps, rationale, citation, guardrail)
VALUES (
  920001, 'light-active-recovery-walk', 'Light Active Recovery Walk', 'active_recovery', 15, 'full_body',
  '[{"movement":"Easy walk","durationSec":600,"cue":"Conversational pace — you can talk in full sentences."},{"movement":"Arm swings & shoulder rolls","durationSec":120,"cue":"Loosen the upper body as you walk."},{"movement":"Cool-down stroll","durationSec":180,"cue":"Slow down and let your breathing settle."}]'::jsonb,
  'Ten to twenty minutes of low-intensity walking is one of the simplest ways to reduce next-day soreness, performing on par with foam rolling and cold-water immersion for DOMS relief.',
  'PMC5932411',
  NULL
)
ON CONFLICT ("sourceId") DO NOTHING;

INSERT INTO public."RecoveryRoutine" ("sourceId", "key", name, category, "durationMin", "bodyFocus", steps, rationale, citation, guardrail)
VALUES (
  920002, 'bodyweight-active-recovery-circuit', 'Bodyweight Active Recovery Circuit', 'active_recovery', 20, 'full_body',
  '[{"movement":"Leg swings","durationSec":120,"cue":"10 front-to-back and 10 side-to-side per leg."},{"movement":"Shoulder circles","durationSec":90,"cue":"Big slow circles, both directions."},{"movement":"Light jog in place","durationSec":300,"cue":"Stay relaxed — keep the heart rate easy."},{"movement":"Hip rotations","durationSec":120,"cue":"Open and close the hips through a comfortable range."},{"movement":"Cool-down walk","durationSec":180,"cue":"Bring the breathing back down."}]'::jsonb,
  'A short circuit of light aerobic movement and joint rotations promotes blood flow and reduces perceived soreness in the hours after training, without adding meaningful fatigue.',
  'PMC5932411; NSCA 2022',
  NULL
)
ON CONFLICT ("sourceId") DO NOTHING;

-- ===== Foam rolling / self-myofascial release =====
INSERT INTO public."RecoveryRoutine" ("sourceId", "key", name, category, "durationMin", "bodyFocus", steps, rationale, citation, guardrail)
VALUES (
  920003, 'full-body-smr-session', 'Full-Body SMR Session', 'foam_rolling', 15, 'full_body',
  '[{"movement":"Quads","durationSec":120,"cue":"60s per side — slow passes, pause on tender spots."},{"movement":"Hamstrings","durationSec":120,"cue":"60s per side."},{"movement":"Glutes","durationSec":120,"cue":"60s per side, cross the ankle over the knee."},{"movement":"Lats","durationSec":90,"cue":"45s per side, roll from armpit to mid-back."},{"movement":"Thoracic spine","durationSec":90,"cue":"Roll the upper back; avoid the lower back."}]'::jsonb,
  'Foam rolling after training produces a small but real reduction in perceived soreness that grows from 24h onward, with modest benefits to sprint and strength recovery and no downside.',
  'PMC6465761; PubMed39593540',
  NULL
)
ON CONFLICT ("sourceId") DO NOTHING;

INSERT INTO public."RecoveryRoutine" ("sourceId", "key", name, category, "durationMin", "bodyFocus", steps, rationale, citation, guardrail)
VALUES (
  920004, 'lower-body-smr-focus', 'Lower-Body SMR Focus', 'foam_rolling', 12, 'lower',
  '[{"movement":"IT band","durationSec":120,"cue":"60s per side — go gently, this one is tender."},{"movement":"Calves","durationSec":90,"cue":"45s per side, stack the legs for more pressure."},{"movement":"Adductors","durationSec":90,"cue":"45s per side, roll the inner thigh."},{"movement":"Hip flexors","durationSec":90,"cue":"45s per side, face-down over the front of the hip."}]'::jsonb,
  'A targeted lower-body roll after leg day addresses the muscle groups most prone to next-day soreness; the benefit is strongest in the 24-72h window after training.',
  'PMC6465761',
  NULL
)
ON CONFLICT ("sourceId") DO NOTHING;

-- ===== Mobility / yoga (ROM only — see guardrail) =====
INSERT INTO public."RecoveryRoutine" ("sourceId", "key", name, category, "durationMin", "bodyFocus", steps, rationale, citation, guardrail)
VALUES (
  920005, 'morning-mobility-flow', 'Morning Mobility Flow', 'mobility', 15, 'full_body',
  '[{"movement":"Cat-cow","durationSec":120,"cue":"10 slow reps, breathe with the movement."},{"movement":"Worlds greatest stretch","durationSec":180,"cue":"5 per side, rotate the chest open."},{"movement":"Thread the needle","durationSec":150,"cue":"8 per side, follow the hand with your eyes."},{"movement":"Deep squat hold","durationSec":60,"cue":"Sit into a comfortable deep squat; use a rail if needed."},{"movement":"Hip 90-90 transitions","durationSec":180,"cue":"5 per side, rotate between the two positions."}]'::jsonb,
  'A flowing mobility sequence improves range of motion and leaves you moving better on a rest or deload day. Treat this as joint-mobility work, not a soreness remedy.',
  'Cochrane CD004577',
  'ROM & mobility only — static stretching does not reduce DOMS (PMC5932411, Cochrane CD004577).'
)
ON CONFLICT ("sourceId") DO NOTHING;

INSERT INTO public."RecoveryRoutine" ("sourceId", "key", name, category, "durationMin", "bodyFocus", steps, rationale, citation, guardrail)
VALUES (
  920006, 'hip-spine-mobility', 'Hip & Spine Mobility', 'mobility', 12, 'lower',
  '[{"movement":"Pigeon pose","durationSec":180,"cue":"90s per side, keep the back leg long."},{"movement":"Couch stretch","durationSec":120,"cue":"60s per side, tuck the pelvis to feel the hip flexor."},{"movement":"Seated spinal twist","durationSec":90,"cue":"45s per side, lengthen the spine before rotating."},{"movement":"Supine knee-to-chest","durationSec":60,"cue":"30s per side, relax the low back into the floor."}]'::jsonb,
  'Opening the hips and spine restores range of motion that heavy squatting and hinging tend to tighten. Use it to move better, not to chase soreness relief.',
  'Cochrane CD004577',
  'ROM & mobility only — static stretching does not reduce DOMS (PMC5932411, Cochrane CD004577).'
)
ON CONFLICT ("sourceId") DO NOTHING;

INSERT INTO public."RecoveryRoutine" ("sourceId", "key", name, category, "durationMin", "bodyFocus", steps, rationale, citation, guardrail)
VALUES (
  920007, 'shoulder-thoracic-mobility', 'Shoulder & Thoracic Mobility', 'mobility', 10, 'upper',
  '[{"movement":"Wall slides","durationSec":90,"cue":"10 reps, keep the wrists and elbows on the wall."},{"movement":"Band pull-aparts","durationSec":90,"cue":"15 reps, squeeze the shoulder blades."},{"movement":"Doorway pec stretch","durationSec":90,"cue":"45s per side, gentle lean through the doorway."},{"movement":"Prone Y-T-W raises","durationSec":150,"cue":"8 reps of each letter, thumbs up."}]'::jsonb,
  'Thoracic and shoulder mobility work counters the rounded posture that accumulates from pressing and pulling, improving overhead range of motion. Mobility goal, not a DOMS cure.',
  'Cochrane CD004577',
  'ROM & mobility only — static stretching does not reduce DOMS (PMC5932411, Cochrane CD004577).'
)
ON CONFLICT ("sourceId") DO NOTHING;

INSERT INTO public."RecoveryRoutine" ("sourceId", "key", name, category, "durationMin", "bodyFocus", steps, rationale, citation, guardrail)
VALUES (
  920008, 'yoga-recovery-flow', 'Yoga Recovery Flow', 'mobility', 20, 'full_body',
  '[{"movement":"Childs pose","durationSec":60,"cue":"Settle the hips back, breathe into the back."},{"movement":"Downward dog","durationSec":45,"cue":"Pedal the heels, lengthen the spine."},{"movement":"Warrior I","durationSec":90,"cue":"45s per side, sink into the front knee."},{"movement":"Seated forward fold","durationSec":60,"cue":"Hinge from the hips, soft knees are fine."},{"movement":"Savasana","durationSec":120,"cue":"Lie still, let the breathing slow."}]'::jsonb,
  'A gentle yoga flow is a supported form of active recovery that doubles as mobility work and downshifts the nervous system on a rest day. Framed as movement and range of motion, not muscle-damage repair.',
  'PMC5932411',
  'ROM & mobility only — static stretching does not reduce DOMS (PMC5932411, Cochrane CD004577).'
)
ON CONFLICT ("sourceId") DO NOTHING;
