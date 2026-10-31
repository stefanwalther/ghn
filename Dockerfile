# syntax=docker/dockerfile:1

# ---- deps -------------------------------------------------------------------
# Full install for the build. This layer is rebuilt only when
# package.json/bun.lock change.
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- builder ----------------------------------------------------------------
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ---- runner -----------------------------------------------------------------
# Minimal production image: prod-only node_modules plus exactly the files
# `next start` and `bun run db:push` need at runtime.
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=21120
ENV GHN_DB_PATH=/app/data/ghn.db

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json bun.lock tsconfig.json next.config.mjs ./
# --production drops devDependencies; --omit=peer drops auto-installed peers
# (playwright test runner, type packages) that nothing imports at runtime.
RUN bun install --production --frozen-lockfile --omit=peer \
  && rm -rf /root/.bun/install/cache /home/bun/.bun/install/cache

COPY --from=builder --chown=appuser:appgroup /app/.next ./.next
COPY --from=builder --chown=appuser:appgroup /app/public ./public
COPY --chown=appuser:appgroup db ./db
COPY --chown=appuser:appgroup lib ./lib
COPY --chown=appuser:appgroup scripts/push.ts ./scripts/push.ts

RUN mkdir -p /app/data && chown appuser:appgroup /app/data

USER appuser

EXPOSE 21120

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "const p=process.env.PORT||'21120';fetch('http://127.0.0.1:'+p+'/api/connection').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "bun run db:push && bun --bun next start -p ${PORT:-21120}"]
