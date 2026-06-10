#!/usr/bin/env bash
# Regenerate prisma/seed-data.sql — the exercise + program-template library that
# ships in the image and is loaded into a fresh database on first boot.
#
# Exports ONLY reference/template tables (no user data: no User, Mesocycle,
# MesoDay, MesoPriority, DayExercise, ExerciseSet, WeightEntry). Run it after
# curating exercises/templates in a populated DB so the image picks up the change.
#
# Source the data from a running Postgres container (default), e.g.:
#   ./scripts/db-export-seed.sh
#   SRC_CONTAINER=roguemeso-db SRC_USER=roguemeso SRC_DB=roguemeso ./scripts/db-export-seed.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SRC_CONTAINER="${SRC_CONTAINER:-openmeso-db}"
SRC_USER="${SRC_USER:-openmeso}"
SRC_DB="${SRC_DB:-openmeso}"
OUT="prisma/seed-data.sql"

# Reference + template tables, in FK-dependency order (pg_dump re-sorts anyway).
TABLES=(MuscleGroup Exercise Template TemplateDay TemplateSlot TemplatePriority)

echo "[export] pg_dump $SRC_DB from container $SRC_CONTAINER (tables: ${TABLES[*]})"
dump_args=(--data-only --column-inserts --no-owner --no-privileges)
for t in "${TABLES[@]}"; do dump_args+=(-t "\"$t\""); done

raw="$(docker exec "$SRC_CONTAINER" pg_dump -U "$SRC_USER" -d "$SRC_DB" "${dump_args[@]}")"

# pg17 pg_dump emits \restrict / \unrestrict psql meta-commands that older psql
# clients reject. Strip them — the committed seed must load under any psql 16/17.
clean="$(printf '%s\n' "$raw" | grep -vP '^\\(un)?restrict')"

{
  cat <<'HEADER'
--
-- RogueMeso reference + template seed snapshot.
--
-- Contents: MuscleGroup, Exercise, Template, TemplateDay, TemplateSlot, TemplatePriority
-- (the exercise + program-template library only — NO user data: no User, Mesocycle,
-- MesoDay, MesoPriority, DayExercise, ExerciseSet, or WeightEntry rows).
--
-- Loaded by docker-entrypoint.sh / scripts/db-setup.sh ONLY when the target DB is empty
-- (Exercise count = 0), AFTER `prisma migrate deploy` has created the schema. Includes
-- setval() calls so identity sequences continue past the seeded ids. Regenerate with:
--   scripts/db-export-seed.sh   (dumps these tables from a populated DB, sanitized).
--
HEADER
  printf '%s\n' "$clean"
} > "$OUT"

echo "[export] wrote $OUT"
grep -c 'INSERT INTO' "$OUT" | xargs echo "[export] INSERT statements:"
grep -c 'setval'      "$OUT" | xargs echo "[export] setval (sequence resets):"
