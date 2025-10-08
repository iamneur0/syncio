# Multi-stage Dockerfile for Syncio
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl3 curl
WORKDIR /app

# Copy package files for both frontend and backend
COPY package*.json ./
COPY client/package*.json ./client/
COPY prisma ./prisma/

# Install all dependencies
RUN npm install --no-package-lock
RUN cd client && npm install --no-package-lock

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/client/node_modules ./client/node_modules
COPY . .

# Generate Prisma client with correct engine
ENV PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x,linux-musl-arm64-openssl-3.0.x"
RUN rm -rf node_modules/.prisma node_modules/@prisma/client/runtime/libquery_engine-*.so.node 2>/dev/null || true
# Use the main schema file for generation
RUN npx prisma generate --schema=prisma/schema.prisma

# Set build-time variables
# Use relative API path so the browser hits same origin; auth UI derived from INSTANCE
ARG NEXT_PUBLIC_API_URL=/api
ARG INSTANCE=private
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV INSTANCE=$INSTANCE

# Build Next.js frontend with derived NEXT_PUBLIC_AUTH_ENABLED
RUN cd client && \
    NEXT_PUBLIC_AUTH_ENABLED=$( [ "$INSTANCE" = "public" ] && echo true || echo false ) \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    npm run build

# Production stage
FROM base AS production
WORKDIR /app

# Create app user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# Create data directory (permissions will be set by docker-compose user setting)
RUN mkdir -p /app/data

# Install runtime dependencies
RUN apk add --no-cache curl openssl3

# Set environment variables for Prisma
ENV PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x,linux-musl-arm64-openssl-3.0.x"

# Allow building instance-specific images (private/public) and set default instance
ARG INSTANCE=public
ENV INSTANCE=$INSTANCE

# Copy built application
COPY --from=builder --chown=appuser:nodejs /app/package*.json ./
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/server ./server
COPY --from=builder --chown=appuser:nodejs /app/prisma ./prisma
COPY --from=builder --chown=appuser:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=appuser:nodejs /app/client/.next ./client/.next
COPY --from=builder --chown=appuser:nodejs /app/client/package*.json ./client/
COPY --from=builder --chown=appuser:nodejs /app/client/node_modules ./client/node_modules
COPY --from=builder --chown=appuser:nodejs /app/client/public ./client/public
COPY --from=builder --chown=appuser:nodejs /app/client/next.config.js ./client/

# Ensure standalone server can serve static and public assets correctly
RUN mkdir -p /app/client/.next/standalone/public/_next/static && \
    cp -r /app/client/public/* /app/client/.next/standalone/public/ 2>/dev/null || true && \
    cp -r /app/client/.next/static/* /app/client/.next/standalone/public/_next/static/ 2>/dev/null || true

# Use maintained startup script that selects Prisma schema based on DATABASE_URL
COPY --from=builder --chown=appuser:nodejs /app/scripts/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Switch to non-root user
USER appuser

# Expose ports
EXPOSE 3000 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Start the application
CMD ["./start.sh"]