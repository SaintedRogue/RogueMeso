# RogueMeso on Unraid

Two containers, both on `br0` with their own static LAN IP (Unraid house style — no
port publishing). The app self-bootstraps: on first start it builds the schema and
loads the exercise + program-template library. **No user accounts are seeded** — you
register your own and immediately have the full exercise library to build a mesocycle.

| Container | Image | Suggested IP | Purpose |
|-----------|-------|--------------|---------|
| `roguemeso-db` | `postgres:17-alpine` (public) | `10.0.0.231` | PostgreSQL data store |
| `roguemeso` | `ghcr.io/SaintedRogue/roguemeso:latest` (**private**) | `10.0.0.232` | The app |

## One-time: let the server pull the private image

The app image lives in a private GHCR repo, so the server needs registry creds once:

```sh
# on RogueServer (Unraid console / SSH), with a GitHub PAT that has read:packages
docker login ghcr.io -u SaintedRogue
```

## Import the templates

Copy both XML files to the Unraid templates dir, then add the containers from the
**Docker → Add Container → Template** dropdown:

```sh
# from this repo, copy to the server (adjust host)
scp deploy/unraid/roguemeso-db.xml deploy/unraid/roguemeso.xml \
    root@10.0.0.2:/boot/config/plugins/dockerMan/templates-user/
```

(Filenames can be anything; Unraid lists them under "User templates".)

## Configure & start — order matters

1. **roguemeso-db** first:
   - Pick a free static IP (suggested `10.0.0.231`; verify it's unused on your LAN).
   - Set `POSTGRES_PASSWORD` to a strong value: `openssl rand -base64 32`.
   - Leave `POSTGRES_USER=roguemeso` / `POSTGRES_DB=roguemeso` (or change both — they
     must match the app's `DATABASE_URL`).
   - Data path defaults to `/mnt/cache/appdata/roguemeso-db` (NVMe). Start it.

2. **roguemeso** second:
   - Pick a free static IP (suggested `10.0.0.232`).
   - `DATABASE_URL` → replace `CHANGE_ME` with the password above and the IP with the
     db container's IP. Keep `?schema=public`. Example:
     `postgresql://roguemeso:<password>@10.0.0.231:5432/roguemeso?schema=public`
   - `AUTH_SECRET` → `openssl rand -base64 48` (must be 32+ chars).
   - Start it.

On first start the app waits for the DB, runs migrations, seeds the library (only when
empty), applies the additive exercise-description and kettlebell seeds, then serves on
port 3000. Watch progress: **Docker → roguemeso → Logs** — on a fresh DB you should see
`empty database — loading exercise + template seed...` then `seed loaded.`, followed by
`kettlebell seed applied.`

3. **Create your account.** Open `http://10.0.0.232:3000` — on a fresh database the app
   shows a one-time **setup screen**. Enter a name, email, and password to create the
   first (admin) account; you're signed straight in. Setup then closes permanently — any
   later accounts are added from **Profile & Settings → User management** (admin only).
   Now create your first mesocycle.

   > ⚠️ **Do this promptly after deploying.** Until the first account exists, anyone who
   > can reach the app on your LAN could claim the admin account. The setup screen
   > self-locks the moment an account is created.

## Notes

- **Restarts are safe.** Migrations and seeds are idempotent; the base library seed only
  loads when the DB has zero exercises, and the additive description/kettlebell seeds use
  conflict guards — so your data is never clobbered or duplicated. (Existing installs gain
  the kettlebell catalog + programs on their next update.)
- **Reboot autostart:** enable autostart for both containers in the Docker tab so they
  return after a server reboot (toggle order: db, then app).
- **Updating the app:** push a new `:latest` (see repo root), then in Unraid use
  *Force update* / *check for updates* on the `roguemeso` container.
- **Refreshing the seeded library:** regenerate the base snapshot from a populated DB with
  `scripts/db-export-seed.sh`, rebuild, and push. Existing databases keep their data
  (the base seed only runs on an empty DB) — use `scripts/db-setup.sh` to seed a DB by hand.
  The kettlebell add-on is maintained separately (`prisma/seed/data/kettlebell*.json` →
  `npx tsx prisma/seed/buildKettlebell.ts --write`) and applied additively on every boot.
