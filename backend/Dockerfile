# Multi-stage build for Quickly Delivery Platform Backend (NestJS + TypeScript)
# 1. Base stage
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# 2. Dependencies stage
FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

# 3. Build stage
FROM base AS builder
COPY package.json package-lock.json tsconfig.json tsconfig.build.json nest-cli.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

# 4. Production stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV MEDIA_ROOT=/app/media

# Create non-root user for security
RUN addgroup --system --gid 1001 quickly && \
    adduser --system --uid 1001 quickly
RUN mkdir -p /app/media && chown quickly:quickly /app/media

COPY --chown=quickly:quickly package.json ./
COPY --chown=quickly:quickly --from=builder /app/node_modules ./node_modules
COPY --chown=quickly:quickly --from=builder /app/dist ./dist
COPY --chown=quickly:quickly 001_schema.sql ./001_schema.sql
COPY --chown=quickly:quickly 002_verificar.sql ./002_verificar.sql
COPY --chown=quickly:quickly migrations ./migrations
COPY --chown=quickly:quickly scripts/migrate.cjs scripts/migrations.cjs scripts/media-cleanup.cjs scripts/expire-orders.cjs scripts/bootstrap-admin.cjs scripts/provision-runtime.cjs ./scripts/

USER quickly
EXPOSE 3000

CMD ["node", "dist/main.js"]
