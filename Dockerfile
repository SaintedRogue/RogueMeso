# syntax=docker/dockerfile:1
# Multi-stage build for the RogueMeso Next.js app (output: "standalone") + Prisma.
# Runtime image carries the standalone server plus the Prisma CLI/engines and
# the prisma/ schema+migrations so the entrypoint can run `migrate deploy`.

# ---- deps: install all dependencies (incl. dev, needed for the build) ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

# ---- prismacli: the Prisma CLI + its full dependency closure, isolated ----
# The standalone trace only carries @prisma/client (what the app imports), not the
# `prisma` CLI used at runtime for `migrate deploy`. Hand-copying the CLI package
# alone misses its transitive deps (@prisma/config -> ...), so install it cleanly
# into its own prefix and copy the whole tree. Kept out of /app/node_modules so it
# never collides with the traced client. Version pinned to match the client.
FROM node:22-alpine AS prismacli
WORKDIR /opt/prisma
RUN apk add --no-cache libc6-compat openssl \
  && npm init -y >/dev/null 2>&1 \
  && npm install prisma@6.19.3

# ---- builder: generate Prisma client + build Next ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client for THIS platform (musl) so the runtime engine matches.
RUN npx prisma generate
# Placeholder DATABASE_URL: the build never connects (authed pages are dynamic),
# but Prisma client construction reads the env name. Real value is injected at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: minimal production image ----
FROM node:22-alpine AS runner
WORKDIR /app
# libc6-compat + openssl: Prisma query engine. postgresql-client: the entrypoint
# uses psql to wait for the DB and to load the reference/template seed on a fresh DB.
RUN apk add --no-cache libc6-compat openssl postgresql-client
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone server + static assets + public/
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Baked changelog (generated from git log on the build host — see scripts/gen-changelog.mjs).
# Read server-side at runtime by the "What's new" panel; never served to clients.
COPY --from=builder /app/changelog.json ./changelog.json

# Prisma schema + migrations + seed snapshot, and the generated client + query
# engine (the standalone trace does not reliably include the engine binary).
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# The Prisma CLI (+ schema engine + full deps) lives in its own prefix; the
# entrypoint invokes it from here for `migrate deploy`.
COPY --from=prismacli /opt/prisma /opt/prisma

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
