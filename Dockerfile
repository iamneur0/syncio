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
RUN npx prisma generate

# Set build-time environment variables
# Use relative API path so the browser hits the same origin and Next.js rewrites proxy to the backend inside the container
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build Next.js frontend
RUN cd client && npm run build

# Production stage
FROM base AS production
WORKDIR /app

# Create app user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# Install runtime dependencies
RUN apk add --no-cache curl openssl3

# Set environment variables for Prisma
ENV PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x,linux-musl-arm64-openssl-3.0.x"
ENV DATABASE_URL="file:/app/data/sqlite.db"

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

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo 'echo "🚀 Starting Syncio..."' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Ensure SQLite directory exists and is writable' >> /app/start.sh && \
    echo 'DB_URL="${DATABASE_URL:-file:/app/data/sqlite.db}"' >> /app/start.sh && \
    echo 'if echo "$DB_URL" | grep -q "^file:"; then' >> /app/start.sh && \
    echo '  DB_FILE=${DB_URL#file:}' >> /app/start.sh && \
    echo '  DB_DIR=$(dirname "$DB_FILE")' >> /app/start.sh && \
    echo '  mkdir -p "$DB_DIR" || true' >> /app/start.sh && \
    echo '  chown -R appuser:nodejs "$DB_DIR" || true' >> /app/start.sh && \
    echo '  chmod -R 775 "$DB_DIR" || true' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Apply Prisma schema (migrations or push fallback)' >> /app/start.sh && \
    echo 'echo "📊 Applying Prisma schema..."' >> /app/start.sh && \
    echo 'npx prisma migrate deploy || true' >> /app/start.sh && \
    echo 'echo "ℹ️ Ensuring schema is applied (db push)..."' >> /app/start.sh && \
    echo 'npx prisma db push --accept-data-loss' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Prefer IPv4 for localhost resolution (avoid ::1 issues)' >> /app/start.sh && \
    echo 'export NODE_OPTIONS="--dns-result-order=ipv4first"' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Start both services using a process manager approach' >> /app/start.sh && \
    echo 'echo "🌐 Starting frontend server on port ${FRONTEND_PORT:-3000}..."' >> /app/start.sh && \
    echo 'cd /app/client && PORT=${FRONTEND_PORT:-3000} npm start &' >> /app/start.sh && \
    echo 'FRONTEND_PID=$!' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Wait a moment for frontend to start' >> /app/start.sh && \
    echo 'sleep 5' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo 'echo "🔧 Starting backend server on port ${BACKEND_PORT:-4000}..."' >> /app/start.sh && \
    echo 'cd /app && PORT=${BACKEND_PORT:-4000} node server/database-backend.js &' >> /app/start.sh && \
    echo 'BACKEND_PID=$!' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Function to handle shutdown' >> /app/start.sh && \
    echo 'cleanup() {' >> /app/start.sh && \
    echo '    echo "🛑 Shutting down services..."' >> /app/start.sh && \
    echo '    kill $BACKEND_PID 2>/dev/null || true' >> /app/start.sh && \
    echo '    kill $FRONTEND_PID 2>/dev/null || true' >> /app/start.sh && \
    echo '    wait' >> /app/start.sh && \
    echo '    exit 0' >> /app/start.sh && \
    echo '}' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Set up signal handlers' >> /app/start.sh && \
    echo 'trap cleanup SIGTERM SIGINT' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Wait for both processes' >> /app/start.sh && \
    echo 'wait $BACKEND_PID $FRONTEND_PID' >> /app/start.sh

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