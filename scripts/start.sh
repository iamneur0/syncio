#!/bin/sh
set -e

echo "🚀 Starting Syncio..."
echo "INSTANCE=${INSTANCE:-unknown}"

# Set configuration based on INSTANCE
case "$INSTANCE" in
  'private')
    export INSTANCE_TYPE="private"
    export NEXT_PUBLIC_INSTANCE_TYPE="private"
    export DATABASE_URL="file:///app/data/sqlite.db"
    export SCHEMA="/app/prisma/schema.sqlite.prisma"
    ;;
  'public')
    export INSTANCE_TYPE="public"
    export NEXT_PUBLIC_INSTANCE_TYPE="public"
    export SCHEMA="/app/prisma/schema.postgres.prisma"
    # DATABASE_URL should be set by compose file
    ;;
  *)
    echo "❌ Unknown INSTANCE: $INSTANCE. Must be 'private' or 'public'"
    exit 1
    ;;
esac

export PRISMA_SCHEMA_PATH="$SCHEMA"
echo "Using Prisma schema: $PRISMA_SCHEMA_PATH"
echo "INSTANCE_TYPE=${INSTANCE_TYPE} DATABASE_URL=${DATABASE_URL}"

# Ensure SQLite dir exists and is writable if using file: URL
if echo "$DATABASE_URL" | grep -q '^file:'; then
  DB_FILE=${DATABASE_URL#file:}
  DB_DIR=$(dirname "$DB_FILE")
  mkdir -p "$DB_DIR" || true
  # Take ownership and ensure write perms for current user
  chown -R "$(id -u):$(id -g)" "$DB_DIR" 2>/dev/null || true
  chmod 775 "$DB_DIR" 2>/dev/null || true
  # Ensure DB file exists
  touch "$DB_FILE" 2>/dev/null || true
  # Final write test
  touch "$DB_DIR/.test" 2>/dev/null && rm -f "$DB_DIR/.test" || {
    echo "⚠️ Warning: Cannot write to $DB_DIR, database may not work properly"
  }
fi

echo "📊 Prisma client already generated in Docker build..."
# Skip Prisma generation since it's already done in the Docker build stage
# bunx prisma generate --schema "$PRISMA_SCHEMA_PATH"

echo "📊 Applying Prisma schema..."
if [ "$INSTANCE" = "public" ]; then
  echo "➡️ Running migrate deploy (Postgres)"
  bunx prisma migrate deploy --schema "$PRISMA_SCHEMA_PATH" || true
else
  echo "➡️ Skipping migrate deploy for SQLite (private)"
  # Clean up any migration conflicts for SQLite (ignore permission errors)
  if [ -f "prisma/migration_lock.toml" ]; then
    echo "➡️ Cleaning up migration lock for SQLite"
    rm -f prisma/migration_lock.toml 2>/dev/null || echo "⚠️ Could not remove migration lock (permission denied)"
  fi
  if [ -d "prisma/migrations" ]; then
    echo "➡️ Cleaning up migrations directory for SQLite"
    rm -rf prisma/migrations 2>/dev/null || echo "⚠️ Could not remove migrations directory (permission denied)"
  fi
fi
echo "➡️ Ensuring schema is applied (db push)"
bunx prisma db push --schema "$PRISMA_SCHEMA_PATH" --accept-data-loss || true

export NODE_OPTIONS="--dns-result-order=ipv4first"

echo "🌐 Starting frontend server on port ${FRONTEND_PORT:-3000}..."

# Check if we should run in development mode (non-minified React errors)
if [ "${NEXT_DEV:-false}" = "true" ] || [ "${NODE_ENV:-production}" = "development" ]; then
  echo "🔧 Running Next.js in DEVELOPMENT mode (non-minified errors enabled)"
  cd /app/client && npx next dev -H 0.0.0.0 -p ${FRONTEND_PORT:-3000} &
else
  echo "🚀 Running Next.js in PRODUCTION mode"
  # Use Next.js standalone output if available
  if [ -f "/app/client/.next/standalone/server.js" ]; then
    cd /app/client && HOSTNAME=0.0.0.0 bun .next/standalone/server.js -p ${FRONTEND_PORT:-3000} &
  else
    cd /app/client && HOSTNAME=0.0.0.0 PORT=${FRONTEND_PORT:-3000} bun run start &
  fi
fi
FRONTEND_PID=$!

sleep 2

echo "🔧 Starting backend server on port ${BACKEND_PORT:-4000}..."
cd /app && HOST=0.0.0.0 PORT=${BACKEND_PORT:-4000} INSTANCE_TYPE=${INSTANCE_TYPE} DATABASE_URL=${DATABASE_URL} bun server/index.js &
BACKEND_PID=$!

cleanup() {
  echo "🛑 Shutting down services..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  wait
  exit 0
}

trap cleanup SIGTERM SIGINT

wait $BACKEND_PID $FRONTEND_PID