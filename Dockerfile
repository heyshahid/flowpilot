# ==============================================================================
# FlowPilot Production Multi-Stage Dockerfile
# Optimized for Railway & Persistent Node.js Deployment (Standalone Mode)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Base Dependencies
# ------------------------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on package-lock.json
COPY package.json package-lock.json ./
RUN npm ci

# ------------------------------------------------------------------------------
# Stage 2: Builder
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client for Linux container environment
ENV PRISMA_CLI_QUERY_ENGINE_TYPE="binary"
ENV PRISMA_CLIENT_ENGINE_TYPE="binary"
RUN npx prisma generate

# Build Next.js standalone application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 3: Runner (Production)
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Add non-root system user and group for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Create persistent storage directory with proper non-root permissions
RUN mkdir -p /app/.data && chown -R nextjs:nodejs /app/.data

# Copy built public assets and static files
COPY --from=builder /app/public ./public 2>/dev/null || true
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema and generated engines for runtime query capabilities
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma 2>/dev/null || true
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma 2>/dev/null || true

# Switch to non-root user
USER nextjs

# Expose default port
EXPOSE 3000

# Railway passes $PORT dynamically. Node server.js binds to PORT and HOSTNAME
CMD ["node", "server.js"]
