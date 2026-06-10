#!/bin/sh
# Bring the schema up to date, seed the reference/template library on a fresh DB,
# then start the standalone Next.js server. Safe to run on every container start:
# migrate deploy and the seed gate are both idempotent.
set -e

# psql/libpq rejects Prisma's `?schema=public` query string — strip it for the
# CLI calls below. The seed SQL is fully schema-qualified (public."..."), so the
# connection's search_path is irrelevant.
PSQL_URL="${DATABASE_URL%%\?*}"

# 1. Wait for Postgres to accept connections (db and app start independently).
echo "[entrypoint] waiting for database..."
i=0
until psql "$PSQL_URL" -c 'SELECT 1' >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "[entrypoint] database not reachable after 60s — giving up." >&2
    exit 1
  fi
  sleep 1
done

# 2. Build/upgrade the schema. No-op if already current (e.g. after a restart).
echo "[entrypoint] prisma migrate deploy..."
node /opt/prisma/node_modules/prisma/build/index.js migrate deploy --schema=prisma/schema.prisma

# 3. Seed the exercise + template library ONLY on a fresh DB. Once any exercises
#    exist (seeded here, or your own data accrued later) this is skipped, so a
#    restart never clobbers user data.
COUNT="$(psql "$PSQL_URL" -tAc 'SELECT count(*) FROM "Exercise";' 2>/dev/null || echo 0)"
if [ "$COUNT" = "0" ]; then
  echo "[entrypoint] empty database — loading exercise + template seed..."
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -q -f prisma/seed-data.sql
  echo "[entrypoint] seed loaded."
else
  echo "[entrypoint] $COUNT exercises already present — skipping seed."
fi

echo "[entrypoint] starting Next.js server on ${HOSTNAME}:${PORT}"
exec node server.js
