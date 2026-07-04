# Zepp OS API Capability Map

Compiled 2026-07-03 from the live docs at docs.zepp.com (v3+ docs tree). Every
method signature and return shape below was quoted from a fetched page — nothing
is from model memory. Where the docs are silent (units, sentinels), that is
flagged rather than assumed.

**Target device: Amazfit Active 2 — API_LEVEL 4.2, Zepp OS 5.0** (per the live
Device List page). All methods gated at API_LEVEL ≤ 4.2 are nominally available.

## The one rule that shapes everything

Almost no Zepp OS history API returns timestamps. Most return **positional
arrays** where the index encodes the time slot, and the caller must derive epoch
timestamps from local midnight + index × interval:

| API | Shape | Slot | Timestamps? |
| --- | --- | --- | --- |
| `HeartRate.getToday()` | `Array<number>` ≤ 1440 | minute-of-day | none (index-derived) |
| `Stress.getToday()` | `Array<number>` ≤ 1440 | minute-of-day | none |
| `Stress.getTodayByHour()` | `Array<number>`[24] | hour-of-day | none |
| `Stress.getLastWeek()` | `Array<number>`[7] | day; **index 0 = 6 days ago** | none |
| `Stress.getLastWeekByHour()` | `Array<{second, stress}>`[168] | — | **UTC epoch seconds** (`second`); `stress 0` = invalid |
| `BloodOxygen.getLastDay()` | `Array<number>`[24] | hourly avg (index-0 meaning undocumented) | none |
| `BloodOxygen.getLastFewHour(h)` | `Array<{spo2, time}>` | — | **UTC epoch seconds** (`time`) |
| `HeartRate.getAFibRecord()` | `Array<{flag, val, maxValue, minValue, time, duration}>` | — | **UTC epoch seconds** (`time`) |
| `Pai.getLastWeek()` | `Array<number>`[7] | day; **index 0 = today** (reverse of Stress!) | none |
| `BodyTemperature.getToday()` | `Array<number>`[288] | 5-min bucket; `-1000` = no measurement | none |
| Sleep (all methods) | see below | **minutes-from-midnight**, never epoch | none |
| `Workout.getHistory()` | `Array<{startTime, duration}>` | — | `startTime` epoch, **unit undocumented** |

## Per-sensor detail

### HeartRate — `import { HeartRate } from '@zos/sensor'` — perm `data:user.hd.heart_rate`
- Realtime: `getCurrent()` (only valid inside `onCurrentChange` cb; registering the
  cb starts continuous measurement), `getLast()`, `onLastChange`, `onRestingChange` (3.0).
- History: `getToday()` per-minute bare numbers (docs: "heart rate measurement data
  in minutes from 0:00 to the current moment, the longest array is 60*24");
  `getResting(): number` (3.0); `getDailySummary(): {maximum: {hr_value, time}}`
  (3.0, `time` unit undocumented); `getAFibRecord()` (3.0).
- No invalid-value sentinel documented for `getToday()` (device shows 0 for
  unmeasured minutes — hardware-verified, not documented).
- **No HR-zone-distribution API exists.**

### BloodOxygen — perm `data:user.hd.spo2`
- Realtime: `getCurrent(): {value, time, retCode}` — `retCode` 0–10, 2 = success;
  `time` unit undocumented. `start()/stop()` (2.1) trigger a spot measurement.
- History: `getLastDay()` (24 hourly averages, bare), `getLastFewHour(hour)` (3.0,
  real timestamps). **No `getLastWeek` exists.**

### Sleep — perm `data:user.hd.sleep`
- `updateInfo()` forces a data refresh (system refreshes every 30 min otherwise) —
  call before reading.
- `getInfo(): {score, deepTime, startTime, endTime, totalTime}` — start/end are
  minutes relative to 0:00 "of the day"; **cross-midnight semantics undocumented**
  (values > 1440 or relative to the sleep day — verify on device).
- `getStage(): Array<{model, start, stop}>` with constants from
  `getStageConstantObj(): {WAKE_STAGE, REM_STAGE, LIGHT_STAGE, DEEP_STAGE}`.
- `getNap(): Array<{length, start, stop}>` (3.0), `getSleepingStatus(): 0|1` (3.0).

### Stress — perm `data:user.hd.stress`
- Realtime: `getCurrent(): {value, time}` (`time` unit undocumented), `onChange`.
- History (all 3.0): see table. `getLastWeekByHour()` is the only timestamped one.

### Step / Calorie / Distance — perms `data:user.hd.{step,calorie,distance}`
- `getCurrent()`, `onChange`; `getTarget()` on Step and Calorie only.
- **No history of any kind. No hourly step breakdown. Calorie is a single number
  (no active/total split). Distance units undocumented on the live page**
  (empirically meters on-device; verify).

### Pai — perm `data:user.hd.pai`
- `getTotal()`, `getToday()` (docs type both as plain numbers — but PR #72/#73
  on-device characterization matters here; trust the device), `getLastWeek()`.

### Workout — perm `data:user.hd.workout`
- `getHistory(): Array<{startTime, duration}>` — **only these two fields.** No
  type, calories, avgHR, maxHR, or distance is readable from a mini-app.
- `getStatus(): {vo2Max, trainingLoad, fullRecoveryTime}` (3.0);
  `getUserHrZoneSettings()` and `getWorkoutTrackNavInfo()` (4.2, live-nav only).

### BodyTemperature — perm `data:user.hd.body_temp` (slug is `BodyTemperature`; `BodyTemp` 404s)
- `getCurrent(): {current /* °C */, timeinterval /* mislabeled in docs */}`.
- `getToday()`: 288 five-minute buckets, `-1000` sentinel.

### Barometer — perm `device:os.barometer` (2.1)
- `getAirPressure(): hPa`, `getAltitude(): meters`, `onChange`. Current-only.

### Accelerometer / Gyroscope — perms `device:os.{accelerometer,gyroscope}` (3.0)
- Raw x/y/z streams with `FREQ_MODE_LOW|NORMAL|HIGH`. **No summarized
  cadence/intensity/classification API exists** → omitted from collection
  (spec forbids raw streaming).

### Battery — no permission required (2.0)
- `getCurrent(): 0–100`, `onChange`.

### Device metadata — `import { getDeviceInfo } from '@zos/device'` — perm `data:os.device.info`
- `{width, height, screenShape, deviceName, keyNumber, deviceSource, keyType,
  deviceColor, bleAddr/btAddr/wifiAddr/barHeight (3.6), hasNFC/hasMic/hasCrown/
  hasBuzzer/hasSpeaker (4.0), uuid (4.2)}`. **No firmware-version field exists.**

### Bonus sensors in the live index (not in the original scope)
`FatBurning`, `Stand`, `Wear`, `Compass`, `checkSensor` (availability probe).

## Platform

### Storage
- `LocalStorage` (`@zos/storage`, 3.0, perm `device:os.local_storage`): sync KV,
  whole-value set/get — fine for cursors/metadata, wrong for append logs.
- `@zos/fs` (2.0): `openSync({path, flag: O_APPEND|O_CREAT})` → fd,
  `writeSync({fd, buffer})` (ArrayBuffer, `position: null` appends),
  `readSync`/`readFileSync`/`writeFileSync`/`statSync({path}) → {size}|undefined`,
  `rmSync`, `renameSync`, `mkdirSync`. All synchronous, rooted in the app's
  `/data` dir. **No size limits documented.** → NDJSON buffer lives here.

### Device ↔ phone messaging
- Low level: device `@zos/ble` `createConnect((index, data, size) => …)` /
  `send(data, size)` ↔ side-service `messaging.peerSocket` (binary only).
- Docs-recommended layer: `MessageBuilder` (`shared/message.js`) —
  `messageBuilder.request({...})` on device, `messageBuilder.on('request', …)` +
  `ctx.response({...})` on side service; handles chunking. zml is NOT what the
  live docs recommend. No payload size cap documented.
- Tear down the connection in `onDestroy` (docs warn about leaks).

### Lifecycle & background
- `App.onCreate → Page.onInit → Page.build → Page.onDestroy → App.onDestroy`;
  `onResume/onPause` exist only for widgets/cards.
- Background collection = App Service (`@zos/app-service`): Continuous mode needs
  perm `device:os.bg_service` + runtime user approval; Single-Execution mode is
  triggered by `@zos/alarm` etc. with a **600 ms budget**. Docs quirk: "File
  writing related APIs can only be used when the screen is off or in AOD display
  mode" (stated in the App Service guide — scope unclear, verify on device).

### Legacy
- `hmSensor`/`hmBle` exist only in the 1.0 docs tree (404 in v3+). Not relevant
  at API_LEVEL 4.2.

## Corrections to naive expectations (flagged, not guessed)

1. No hourly-steps API — daily total + goal only.
2. No active/total calorie split — one number + target.
3. Workout history = `{startTime, duration}` only; richer workout data must come
   from our own on-watch capture (the existing workout HR sync path), not this API.
4. No HR-zone distribution API.
5. No accelerometer/gyro summary metrics — raw streams only.
6. No firmware-version field in `getDeviceInfo()`.
7. Nearly all history is positional; epoch timestamps must be derived from local
   midnight + slot index, and slot values of 0 / -1000 are unmeasured sentinels.
