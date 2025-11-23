# syntax=docker/dockerfile:1.11
FROM node:24-alpine AS base

# Stage 1: Dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files from frontend directory
COPY frontend/package*.json ./
COPY frontend/pnpm-lock.yaml* ./

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --no-frozen-lockfile

# Stage 2: Builder
FROM base AS builder
WORKDIR /app

# Build args for Next.js public env vars (must be set at build time)
# NEXT_PUBLIC_API_URL is empty for client-side - uses Next.js proxy
# BACKEND_URL is for server-side proxy to backend container
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy frontend source code
COPY frontend/ ./

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Build the application
RUN pnpm run build 2>&1 | tee build.log

# Stage 3: Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Create nextjs user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Set permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
