# Wellness sync — build, install, trigger, and what the server receives

The beacon app (v0.8.0) collects a full wellness snapshot — heart rate, SpO2, sleep,
stress, steps/calories/distance, PAI, body temperature, workout history, barometer,
device metadata — buffers it on the watch filesystem, and syncs it to your RogueMeso
server through the Zepp phone app. API behavior referenced below is documented in
`docs/api-capability-map.md` (compiled from the live Zepp OS docs).

## 1. Build and sideload

Prereqs are unchanged from `README.md` (zeus CLI, Node 18–20, `zeus login` with the
Zepp account paired to the watch):

```bash
cd zepp-beacon
zeus preview          # builds and shows a QR code
```

In the Zepp phone app: **Profile → your device → Developer Mode → scan the QR**. The
app installs over the previous version; settings (server URL + token) are preserved.

The version bump to 0.7.0 (code 10) adds these manifest permissions, so a re-install
is required — an old build will throw permission errors on the new sensors:
`data:user.hd.{spo2,sleep,stress,step,calorie,distance,pai,workout,body_temp}` and
`device:os.barometer`.

## 2. Configure and grant permissions

1. Zepp app → device → **RogueMeso Beacon → Settings**: set your server URL (e.g.
   `https://your-roguemeso-server`) and the beacon token from **Profile → Wearables**
   in RogueMeso (shown once at generation).
2. On first collection the watch may prompt for health-data permission for the newly
   added sensor classes; approve them. If a domain persistently reports as
   unavailable, check **watch Settings → Privacy → Mini Programs** (naming varies by
   firmware) and confirm the beacon has health-data access.
3. Background recording (the HR recorder) still separately asks for the background
   service permission when you press **Record** — unchanged.

## 3. Trigger a sync

Open the beacon app on the watch:

- **On open**, a wellness snapshot is collected automatically ~1.5 s after launch and
  buffered to the watch filesystem (rolling buffer, newest 8 snapshots kept). Nothing
  is transmitted yet.
- **Press "Wellness"** (bottom button) to seal a fresh snapshot and drain *all*
  buffered snapshots to the server, oldest first. The status line shows per-part
  progress; each snapshot file is deleted only after the server acks it, so a failed
  sync simply retries next time.
- Phone must be in BLE range with the Zepp app alive (foreground or recent
  background) — the Side Service is the only component with network access.

"Sync HR", "Record", and "Ping" behave exactly as before; the wellness path is
additive.

### All-day HR tracking ("Track" button)

`getToday()` on this device is a gap-compacted array with no recoverable
index→time mapping (characterized from raw dumps — see §5), so all-day HR uses
capture-time sampling instead:

- **Press "Track"** to arm a repeating one-minute alarm that wakes the
  `minute-logger` App Service (Single Execution mode, ~600 ms per wake — no
  long-lived background process). Each wake stamps the watch's latest HR reading
  with the current epoch time and buffers it; batches seal every 30 samples into
  the same files the session recorder uses.
- The alarm **persists across reboots** until you press "Track ●" again to disarm.
- Samples sync through the existing drain: **open the beacon app** and buffered
  batches upload oldest-first with per-file server acks (a full day is ~48 files,
  about a minute of the app being open). They land as `HrSample` rows.
- Resolution follows the watch's own monitoring cadence: `getLast()` returns the
  system's most recent measurement, sampled on a 1-minute clock (denser
  measurements during workouts, sparser when idle — repeats are recorded as an
  honest staircase).
- Two caveats from the platform docs: file writes inside a background service only
  work with the screen off or in AOD (a wake-up while the screen is on may skip
  one minute), and unsynced batches cap at ~50 h — open the app at least daily to
  avoid the oldest dropping.

## 4. What the server receives

The Side Service reassembles the per-domain parts and POSTs **one** JSON body to
`POST /api/wearables/zepp` (bearer-token auth, same as HR):

```jsonc
{
  "type": "wellness",
  "syncId": "wellness_1780000000.ndjson-1780000012345",
  "collectedAt": 1780000000000,          // epoch ms, skew-corrected server-side
  "watchNow": 1780000012000,
  "phoneAt": 1780000012500,
  "errors": { "environment": "..." },     // domains that threw on-watch
  "sections": {
    "device":      { "model": ..., "deviceSource": ..., "firmware": null,
                     "battery": 78, "appVersion": "0.7.0", "screen": {...} },
    "heartRate":   { "current": {"bpm": 62, "at": ...}, "resting": 54,
                     "dailyMax": {"bpm": 148, "at": ..., "rawTime": ...},
                     "history": null, "historyNote": "...", "zones": null },
    "bloodOxygen": { "latest": {"percent": 97, "at": ...},
                     "history": [[epochMs, percent], ...] },
    "sleep":       { "lastNight": { "score": 81, "totalMinutes": 432,
                       "deepMinutes": 88, "startAt": ..., "endAt": ...,
                       "raw": {"startTime": 1380, "endTime": 432},
                       "timesDerived": true,
                       "stages": [{"stage": "deep|light|rem|awake",
                                   "startAt": ..., "durationMinutes": ...,
                                   "raw": {...}}] },
                     "naps": [...] | null },
    "stress":      { "current": {"level": 34, "at": ...},
                     "history": [[epochMs, level], ...] },   // 7d hourly
    "activity":    { "steps": 6210, "stepGoal": 8000,
                     "calories": {"total": 1450, "active": null},
                     "calorieGoal": ..., "distanceRaw": ...,
                     "distanceUnit": "device-raw (undocumented; observed meters)",
                     "hourlySteps": null, "activeMinutes": null },
    "pai":         { "total": 92, "today": ..., "trend": [[dayStartMs, pai], ...] },
    "bodyTemp":    { "latest": {"celsius": 35.4, "at": ...},
                     "history": [[epochMs, celsius], ...], "timesDerived": true },
    "workouts":    { "history": [{"startAt": ..., "rawStartTime": ...,
                       "durationSeconds": ..., "type": null, "calories": null,
                       "avgHR": null, "maxHR": null, "distanceMeters": null}],
                     "training": {"vo2Max": ..., "trainingLoad": ...,
                                  "fullRecoveryTime": ...} },
    "environment": { "pressure": {"hpa": ..., "at": ...},
                     "altitude": {"meters": ..., "at": ...} }
  }
}
```

The server validates (domain whitelist, 128 KB cap, clock-skew window; see
`src/lib/wellness.ts`) and stores each snapshot as one `WellnessSnapshot` row —
`payload` is the `{sections, errors}` object verbatim, `collectedAt` is the corrected
watch time. The `{ "ok": true }` response is the ack the watch waits on.

Timestamp conventions inside sections: `at` fields and `[epochMs, value]` pairs are
epoch milliseconds. `timesDerived: true` marks values reconstructed from documented
slot grids or minute-of-day offsets (body temp's 5-minute grid, sleep's minute
offsets) rather than carried by the API; `raw*` fields always preserve the original
values so semantics can be re-derived server-side if a device deviates.

## 5. Known limitations (why fields can be null)

Confirmed against the live Zepp OS docs (2026-07-03) and, where noted, on-device:

- **HR minute history is intentionally `null`.** On the Amazfit Active 2,
  `HeartRate.getToday()` violates the documented per-minute grid (field-proven:
  ~9 s cadence during workouts), so per-minute HR ships only via the recorder
  service / "Sync HR" — both timestamp at capture. `zones` is null because no
  HR-zone-distribution API exists.
- **Workout history is `{startTime, duration}` only.** The mini-app API exposes no
  type, calories, HR stats, or distance per workout; those fields are permanently
  null from this source.
- **No hourly steps, no active/total calorie split, no active-minutes metric** —
  those APIs don't exist; `activity` carries daily totals + goals only.
- **Distance units are undocumented** — shipped as `distanceRaw`.
- **Sleep epochs are heuristic across midnight** (`timesDerived: true`): the API
  reports minute-of-day offsets with undocumented cross-midnight semantics; raw
  values are preserved for re-derivation.
- **`environment` will be null/absent on devices without a barometer**; body temp
  requires a device with the skin-temperature sensor. Sensors missing on a given
  model surface in `errors` rather than failing the snapshot.
- **SpO2/stress history** use the only timestamped APIs available
  (`getLastFewHour`, `getLastWeekByHour`, UTC seconds → ms). Untimestamped variants
  (`getLastDay`, `getToday`) are deliberately not collected.
- **Device metadata has no firmware-version field** in the public API
  (`firmware: null` always); accelerometer/gyroscope are omitted entirely — they
  stream raw axes only, with no summary metrics, and raw motion streaming is out of
  scope.
