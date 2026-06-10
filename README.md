# RogueMeso

A self-hosted hypertrophy training app — build mesocycles, log your sets with RIR targets,
and let the progression engine handle weekly volume/intensity and deloads. Multi-user for a
household: an admin provisions accounts, and each person's training data is private.

Built with Next.js 16, Postgres, and Prisma.

## Stack

- **Next.js 16** (App Router, Server Actions, "Proxy" route protection)
- **Postgres 17** via Docker · **Prisma 6** ORM
- **Tailwind v4** UI · single-user-style cookie auth with per-user accounts (bcrypt)

## First run

```bash
# 1. Configure environment
cp .env.example .env
#    Edit .env: set the DB vars, then generate AUTH_SECRET with
#    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Start Postgres + install deps
docker compose up -d
npm install

# 3. Apply the schema
npx prisma migrate deploy

# 4. (optional) Seed the reference data + template library
#    point SEED_DATA_DIR (in .env) at your seed export, then:
npm run db:seed

# 5. Create the first admin account (uses ADMIN_* from .env)
npm run db:admin

# 6. Run
npm run dev   # http://localhost:3000
```

Sign in with the admin email/password, then provision additional users from
**Profile → Users** (admin only). `AUTH_SECRET` signs the session cookie.

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

## License

[MIT](LICENSE).
