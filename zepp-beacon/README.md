# RogueMeso Beacon (Zepp OS mini-app)

A watch app for Amazfit (Zepp OS 3.0+). **Current state: the spike** — a single
"Send ping" button that exercises every hop the real recovery beacon depends on:

```
watch (Device App, @zos/sensor) → BLE (zml request) → Side Service (Zepp phone app)
  → HTTPS POST → RogueMeso /api/wearables/zepp
```

This directory is its own ecosystem (zeus bundler, `@zos/*` runtime): it is excluded
from the web app's lint/typecheck/Docker build. Nothing here ships in the container.

## One-time setup

1. **Node 18–20 for zeus** (the CLI's bundled inquirer crashes on Node 26):
   `~/.local/node20/bin` — see "Toolchain" below.
2. `npm i -g @zeppos/zeus-cli` (already at `~/.npm-global/bin/zeus`).
3. `cd zepp-beacon && npm install` (pulls `@zeppos/zml`).
4. `zeus login` — log in with the **same Zepp account the watch is paired to**.
5. Server side: set `ZEPP_BEACON_TOKEN=<any long random string>` in the roguemeso
   container env (Unraid template → add variable, Mask on). Unset = route answers 503.
6. Phone: Zepp app → Profile → Settings → About → **tap the logo ~7×** → Developer Mode
   appears under Settings.

## Install on the watch

```sh
cd zepp-beacon
PATH=~/.local/node20/bin:~/.npm-global/bin:$PATH zeus preview
```

Scan the printed QR from Zepp app → Settings → Developer Mode → Scan. The app installs
over BLE and appears in the watch's app list. (If it fails with "transmission channel
occupied", the watch is mid-sync — wait and rescan.)

Then in the Zepp app, open the mini-app's **Settings** (long-press the app card in
Developer Mode / app list) and paste:
- **Server URL**: the RogueMeso base URL
- **Beacon token**: the same value as `ZEPP_BEACON_TOKEN`

## The spike protocol (answers the 4 undocumented behaviors)

| # | Question | How |
|---|----------|-----|
| 1 | Does the Side Service run with the Zepp app backgrounded / killed? | Tap **Send ping** with the Zepp app (a) foregrounded, (b) backgrounded, (c) force-killed. Watch shows OK/ms per attempt; `docker logs roguemeso \| grep zepp-beacon` is the server truth. |
| 2 | Does Heart Rate Push broadcast outside a workout? | Separate from this app: toggle Zepp app → Device → Health Monitoring → Heart Rate Push, then use RogueMeso's **Connect HR** on the workout screen — idle first, then during a native workout. |
| 3 | Do sideloaded apps survive reboot / firmware update? | Reboot the watch; re-check the app list. Repeat after the next OTA. |
| 4 | Real `onCurrentChange` sampling rate? | Deferred — live HR ships via Heart Rate Push (path A), so this only matters for future ideas. |

Record results in the PR/issue; #1 decides whether the real beacon can promise
"set-and-forget" morning sync or needs open-the-app framing.

## Toolchain

zeus needs Node ≤20. A local copy lives at `~/.local/node20` (untracked):

```sh
curl -fsSL https://nodejs.org/dist/v20.19.0/node-v20.19.0-linux-x64.tar.xz \
  | tar -xJ -C ~/.local && mv ~/.local/node-v20.19.0-linux-x64 ~/.local/node20
```

`zeus dev` (simulator) is Windows/macOS-only — irrelevant here since sensors/fetch are
mocked in it anyway; real-device preview is the loop that matters.
