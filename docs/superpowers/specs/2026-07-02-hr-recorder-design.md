# On-Watch Heart-Rate Session Recorder — Design

**Status:** approved for build · **Date:** 2026-07-02 · **Depends on:** live HR capture
(PR #51–57), Zepp beacon spike results (PR #52/59/60)

## Problem

Live HR capture via Web Bluetooth works but is fragile by architecture: it needs the
watch advertising (hidden while the Zepp app holds its link), a foregrounded browser,
and an unbroken radio link — any failure loses data permanently. The spike proved the
alternative: the watch's own sensor ticks at ~1 Hz (`onCurrentChange`, 60+ updates/60s
at rest) and the Side Service relay delivers to the server in ~2s.

**Goal:** the watch records HR autonomously during a workout and syncs it to RogueMeso
every ~30s, correlated to the session by time. The Web Bluetooth pill remains an
optional live display; the recorder is the authoritative data source. Gaps become
latency, never loss.

## Architecture

```
WATCH                                PHONE (Zepp app)          SERVER
Device App (UI: record/stop/status)
  └─ App Service (background, 1 Hz)
       buffer (memory + @zos/fs)  ──BLE──▶ Side Service ──POST──▶ /api/wearables/zepp
       trims on server ack        ◀──ack── (stateless    ◀──ok──  type:"hr"
                                            relay)                → HrSample rows
```

### Design decisions (and why)

1. **Samples are day-agnostic; attribution happens at read time.**
   `HrSample.dayId` becomes nullable. Recorder rows store only `(userId, at, bpm)`;
   the chart query (`getSessionHrView`) matches them to a session by time window:
   `startedAt − 15 min ≤ at ≤ (finishedAt ?? now) + 15 min`. This is the "match times"
   requirement made structural — no fragile "which day is open right now" guessing at
   write time, warm-up HR before the first logged set is included, and a recorder
   started early or stopped late attributes correctly. Live-BLE rows keep writing
   `dayId` as today (the browser knows its session).

2. **The watch owns retry; every hop below it is stateless.**
   The App Service keeps samples (memory, mirrored to `@zos/fs` for crash safety)
   until the *server's* ack propagates back through the Side Service. Phone
   unreachable, Zepp app dead, server down — the buffer just grows and drains later.
   One owner of truth = no distributed-queue bugs.

3. **Flush is sample-driven, not timer-driven.**
   App Services lack `setTimeout` (doc-verified); rather than gamble on `@zos/timer`
   in background context, the 1 Hz `onCurrentChange` callback IS the clock: flush when
   `unsynced ≥ 30 samples` or `now − lastFlush ≥ 30s` (checked per tick). Zero timers,
   and a stopped sensor stream (watch off wrist) naturally stops network chatter.

4. **Per-user token replaces the spike's env token.**
   `User.zeppTokenHash` (sha256). Generated/revoked in Profile → Wearables; shown once
   at generation. The route hashes the presented bearer and looks up the user — that's
   what lets HrSample rows get a real `userId`. `ZEPP_BEACON_TOKEN` env support is
   removed with the spike.

5. **Clock skew is measured per batch, not trusted.**
   Every batch carries `watchNow`; the server computes `skew = serverNow − watchNow`
   and, when `|skew| > 5s`, shifts all sample timestamps by it. The watch clock is
   normally phone-synced, but "normally" isn't a correlation strategy when set
   markers live on server time.

6. **Duplicate sources merge at read time.**
   If the BLE pill and the recorder both ran, the same heartbeat exists twice.
   `getSessionHrView` collapses samples to one per second (max bpm wins — same sensor,
   tie-breaking is cosmetic). No write-time coordination needed.

## Wire protocol (watch ↔ side service ↔ server)

Batch message (zml request, fields on the request object — spike lesson):

```
{ method: "HR_BATCH", seq: 7, t0: 1783040000000, watchNow: …,
  s: [[0,102],[1,104],[2,101], …] }        // [secondsSinceT0, bpm] — BLE-compact
```

Side Service → POST `/api/wearables/zepp`:

```
{ type: "hr", seq, t0, watchNow, phoneAt, s: [[…]] }   // + Authorization: Bearer
→ 200 { ok: true, seq, stored: n, serverAt }
```

Ack (`ok && seq`) returns to the App Service → buffer trimmed through `seq`.
Batches are idempotent-ish by content; exact-duplicate rows are tolerated because
read-time dedup collapses them (decision 6).

## Watch app behavior

- **Record screen:** big start/stop, live bpm, `n samples · synced 12s ago`, battery.
  Start = `requestPermission(bg_service)` → start App Service → user can leave.
- **Auto-stop:** hard cap 3 h (battery guard); manual stop is the normal path;
  stopping flushes everything and shows a final `synced ✓` state.
- **Restart safety:** service `reload: true` + fs buffer restore — a watch reboot
  mid-session resumes recording and keeps unsynced samples.
- **Constraint accepted:** one continuous App Service exists system-wide; ours owns
  the slot while recording. Coexistence with the native workout app is untested
  (spike experiment, still open) — field-test in R2 before polishing.

## Server changes

- Migration: `HrSample.dayId` → nullable (+ keep both indexes); `User.zeppTokenHash`.
- Route `type:"hr"`: per-user token auth → skew correction → `sanitizeBatch` (existing
  gate) → `createMany`. Rate limit stays.
- `getSessionHrView`: window query + per-second merge/dedup (pure, TDD).
- Profile → Wearables panel: generate/revoke token (server action, hash at rest).

## "Synced during workout" UX

Recorder cadence is ~30s, so the workout page can show near-live HR without Web
Bluetooth: when the pill isn't BLE-connected but recorder samples for the open session
are fresher than 90s, the pill renders `♥ 132 · via watch · 40s ago` (small poll or
router refresh piggyback). Ships as **R3** — the chart already reflects synced data on
every page refresh from R1 onward.

## Build phases

- **R1 — server (1 evening, fully TDD-able, ships alone):** migration, per-user token
  + Profile panel, `type:"hr"` route, window-attribution + dedup in `getSessionHrView`.
  Verifiable with `curl` before any watch code exists.
- **R2 — watch recorder (the main build):** record screen, App Service, fs-backed
  buffer + ack trimming, batch protocol. Field-test protocol: full session with phone
  present; phone-in-locker session (buffer + late drain); Zepp-app-killed session
  (open spike question); reboot mid-session.
- **R3 — live-ish pill fallback + polish:** `via watch` pill state, auto-stop tuning,
  recorder status on the session HR card.

## Failure modes

| Failure | Behavior |
|---|---|
| Phone absent/out of range | Buffer grows on watch (fs-backed, hours of headroom at ~8 B/sample); drains on reunion |
| Zepp app killed | Same as absent — relay resumes when Zepp revives (spike experiment #1 validates in R2) |
| Server down / 5xx | No ack → watch retains; next flush retries |
| Watch reboots mid-session | Service auto-restarts, buffer restored from fs |
| Both recorder + BLE pill ran | Read-time per-second merge — one clean series |
| Token revoked mid-session | 401 → watch shows "re-pair in Zepp settings"; data held until re-auth |
