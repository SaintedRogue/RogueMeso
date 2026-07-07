# RogueMeso Beacon — build, install, and track workout HR

The beacon app (v0.10.0) does one thing: capture your heart rate during a workout
and sync it to RogueMeso as timestamped `HrSample` rows. Two buttons —
**Track Workout** and **Ping** (a connectivity check).

## 1. Build and sideload

Prereqs (see `README.md`): zeus CLI, Node 18–20, `zeus login` with the Zepp account
paired to the watch.

```bash
cd zepp-beacon
zeus preview          # builds and shows a QR code
```

In the Zepp phone app: **Profile → your device → Developer Mode → scan the QR**. The
app installs over the previous version; settings (server URL + token) are preserved.

v0.10.0 slims the manifest to four permissions — `data:os.device.info`,
`data:user.hd.heart_rate`, `device:os.bg_service`, `device:os.alarm`. A re-install is
required.

## 2. Configure

Zepp app → device → **RogueMeso Beacon → Settings**: set your server URL (e.g.
`https://your-roguemeso-server`) and the beacon token from **Profile → Wearables** in
RogueMeso (shown once at generation).

## 3. Track a workout

`getToday()` on this device is a gap-compacted array with no recoverable index→time
mapping, so HR is captured at the moment it's read, on a one-minute schedule:

1. **Press "Track Workout" when you start.** This arms a repeating one-minute alarm
   that wakes the `minute-logger` App Service (Single Execution mode, ~600 ms per
   wake — no long-lived background process for the OS to kill). Each wake stamps the
   watch's latest HR reading with the current epoch time and buffers it; batches seal
   every 10 samples.
   - The status card shows **`● Tracking Xm · ♥ NN`** while active — the ♥ confirms
     the alarm is firing and samples are landing.
2. **Auto-off after 3 h** (alarm `end_time` + a service-side deadline guard), or press
   **"Stop Tracking"** to end early. The alarm survives a mid-workout reboot.
3. **Data syncs automatically the next time you open the app.** On open, any stuck
   partial batch is sealed and all buffered batches drain oldest-first with per-file
   server acks, landing as `HrSample` rows that the platform matches to your logged
   session by time window. (Pressing Stop also seals the final partial batch
   immediately.) The phone must be in BLE range with the Zepp app alive.

**Ping** just verifies the phone→server link (round-trip time on success).

## 4. What the server receives

Each batch is one POST to `POST /api/wearables/zepp` (bearer-token auth):

```jsonc
{
  "type": "hr",
  "seq": 483920,            // batch id (for the ack)
  "t0": 1783460000000,      // epoch ms anchor
  "s": [[0, 72], [61, 74], [122, 78]],  // [secondsSinceT0, bpm] pairs
  "watchNow": 1783460400000 // watch clock at send, for skew correction
}
```

The server skew-corrects, decodes to `{at, bpm}`, sanitizes (25–250 bpm, within the
26 h watch gate), and inserts `HrSample` rows (`dayId: null` — matched to a session at
read time by time window). It replies `{ ok: true, stored: N }` — that ack is what lets
the watch delete the batch file.

## 5. Known limits

- **Forward-only:** capture starts when you press Track. HR from before arming isn't
  recoverable on-device.
- **1 sample/min:** the alarm API's floor. Fine for seeing effort across sets/rest;
  not a dense 1 Hz curve.
- **Screen-off fs writes:** a wake-up while the screen is on may skip one minute (the
  alarm fires again next minute).
- **Sync on open:** unsynced batches cap at ~50 h; open the app within a day or two of
  a workout so nothing is dropped.
