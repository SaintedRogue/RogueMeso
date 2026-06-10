# RogueMeso

A self-hosted hypertrophy training app — build mesocycles, log your sets with RIR targets,
and let the progression engine handle weekly volume/intensity and deloads. Multi-user for a
household: an admin provisions accounts, and each person's training data is private.

Built with Next.js 16, Postgres, and Prisma.

## Stack

- **Next.js 16** (App Router, Server Actions, "Proxy" route protection)
- **Postgres 17** via Docker · **Prisma 6** ORM
- **Tailwind v4** UI · single-user-style cookie auth with per-user accounts (bcrypt)

## Setup

```bash
# 1. Start Postgres
docker compose up -d

# 2. Install deps
npm install

# 3. Apply schema
npx prisma migrate deploy   # (or `prisma migrate dev` in development)

# 4. Seed reference data + templates (point SEED_DATA_DIR at your seed export)
SEED_DATA_DIR=/path/to/seed-data npx tsx prisma/seed/index.ts

# 5. Create the first (admin) account
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='choose-one' npx tsx prisma/seed/createAdmin.ts

# 6. Run
npm run dev   # http://localhost:3000
```

`AUTH_SECRET` (in `.env`) signs the session cookie. Sign in with the admin email/password;
provision additional users from **Profile → Users** (admin only).

## Data model

`MuscleGroup → Exercise` · `Template → TemplateDay → TemplateSlot` (+ priorities) ·
`Mesocycle → MesoDay → DayExercise → ExerciseSet` (+ priorities). Mesocycles and logged sets
are owned per user (`userId`); muscle groups, the exercise catalog, and templates with
`userId = null` form a shared library. Sets carry both targets (`weightTarget`/`repsTarget`/RIR)
and logged actuals, with a `status` workflow.

## Progression engine

`src/lib/progression.ts` — isolated and tunable: target RIR ramps to 0 with a final-week
deload, training volume rises MEV → MRV by muscle-group priority (maintain/grow/emphasize),
and working weights are clamped to a sane range. All constants live in one file so you can
adapt the model to your own methodology. See `src/lib/features/README.md` to extend.

## Self-hosting

`docker-compose.yml` runs Postgres; run the Next app alongside it
(`npm run build && npm start`). Everything stays on your own machine.
