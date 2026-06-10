#!/usr/bin/env bash
# Manual escape hatch: build the schema and seed the exercise/template library
# against an arbitrary Postgres — WITHOUT the app container.
#
# The app container already does this automatically on first boot
# (docker-entrypoint.sh). Use this only to recover, re-seed, or initialize a
# database you manage yourself.
#
#   DATABASE_URL=postgresql://roguemeso:PASS@10.0.0.231:5432/roguemeso ./scripts/db-setup.sh
#
# Needs npx (repo deps installed) for migrations. For the seed load it uses psql
# if present, otherwise a throwaway postgres:17-alpine container via Docker.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?set DATABASE_URL=postgresql://user:pass@host:5432/db}"
# psql/libpq rejects Prisma's ?schema=... query string — strip it. The seed SQL
# is schema-qualified (public."..."), so search_path does not matter.
PSQL_URL="${DATABASE_URL%%\?*}"
SEED="prisma/seed-data.sql"
export DATABASE_URL

# psql wrapper: native if available, else dockerized (host network to reach a LAN IP).
psql_run() {
  if command -v psql >/dev/null 2>&1; then
    psql "$PSQL_URL" "$@"
  else
    docker run --rm -i --network host postgres:17-alpine psql "$PSQL_URL" "$@"
  fi
}

echo "[db-setup] prisma migrate deploy..."
npx prisma migrate deploy

COUNT="$(psql_run -tAc 'SELECT count(*) FROM "Exercise";' 2>/dev/null | tr -cd '0-9')"
COUNT="${COUNT:-0}"
if [ "$COUNT" = "0" ]; then
  echo "[db-setup] empty database — loading exercise + template seed..."
  if command -v psql >/dev/null 2>&1; then
    psql "$PSQL_URL" -v ON_ERROR_STOP=1 -q -f "$SEED"
  else
    docker run --rm -i --network host postgres:17-alpine psql "$PSQL_URL" -v ON_ERROR_STOP=1 -q < "$SEED"
  fi
  echo "[db-setup] seed loaded."
else
  echo "[db-setup] $COUNT exercises already present — skipping seed."
fi
