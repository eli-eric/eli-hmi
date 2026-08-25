FROM harbor.eli-beams.eu/eli_images/eli-node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  elif [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG LDAP_SERVER_URL=ldap://10.78.0.11
ARG LDAP_BASE_DN=dc=lcs,dc=local
ARG LDAP_USE_TLS=false

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

# LDAP Authentication Settings
ENV LDAP_SERVER_URL=$LDAP_SERVER_URL
ENV LDAP_BASE_DN=$LDAP_BASE_DN
ENV LDAP_USE_TLS=$LDAP_USE_TLS

RUN \
  if [ -f package-lock.json ]; then npm run build; \
  elif [ -f yarn.lock ]; then yarn run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Config-validator CLI — the exact check the controls team's config repo runs
# in CI, packaged so it needs nothing but Docker on the caller's side. Reuses
# `deps`, which installs devDependencies (tsx) because NODE_ENV is not yet
# production at that stage. No `next build` involved.
#
# BuildKit skips this stage for the default build: `runner` is the last stage
# and does not depend on it. Build it explicitly with `--target validator`.
#
#   docker run --rm -v "$PWD:/config:ro" <image>:<app-release-tag> --all
#
# Runs as root deliberately, unlike `runner`: it only ever reads a read-only
# bind mount, and root avoids uid mismatches with whoever owns the config
# checkout on the host.
FROM base AS validator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENTRYPOINT ["/app/node_modules/.bin/tsx", "scripts/validate-config.ts", "--dir", "/config"]
CMD ["--all"]


# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ARG LDAP_SERVER_URL=ldap://10.78.0.11
ARG LDAP_BASE_DN=dc=lcs,dc=local
ARG LDAP_USE_TLS=false

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8082

ENV PORT=8082

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
ENV HOSTNAME="0.0.0.0"

# API_URL, API_SCHEME, ZONE_CODE, and CONFIG_DIR are intentionally left unset
# here — they are supplied at container start by the deployment's Compose
# configuration and read live by /api/runtime-config, Proxy, and config loaders.

# LDAP Authentication Settings
ENV LDAP_SERVER_URL=$LDAP_SERVER_URL
ENV LDAP_BASE_DN=$LDAP_BASE_DN
ENV LDAP_USE_TLS=$LDAP_USE_TLS
# Set to true in production, false in development
ENV NODE_ENV=production
CMD ["node", "server.js"]
