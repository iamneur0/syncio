#!/bin/sh
set -e

echo "🚀 Starting Syncio..."
echo "INSTANCE=${INSTANCE:-unknown}"

# Set configuration based on INSTANCE
case "$INSTANCE" in
  'private')
    export AUTH_ENABLED="false"
    export NEXT_PUBLIC_AUTH_ENABLED="false"
    export DATABASE_URL="file:/app/data/sqlite.db"
    export SCHEMA="/app/prisma/schema.sqlite.prisma"
    ;;
  'public')
    export AUTH_ENABLED="true"
    export NEXT_PUBLIC_AUTH_ENABLED="true"
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
echo "AUTH_ENABLED=${AUTH_ENABLED} DATABASE_URL=${DATABASE_URL}"

# Ensure SQLite dir exists if using file: URL
if echo "$DATABASE_URL" | grep -q '^file:'; then
  DB_FILE=${DATABASE_URL#file:}
  DB_DIR=$(dirname "$DB_FILE")
  mkdir -p "$DB_DIR" || true
  # Try to set permissions, but don't fail if not possible
  chmod 755 "$DB_DIR" 2>/dev/null || true
  # Ensure the directory is writable by the current user
  touch "$DB_DIR/.test" 2>/dev/null && rm -f "$DB_DIR/.test" || {
    echo "⚠️ Warning: Cannot write to $DB_DIR, database may not work properly"
  }
fi

echo "📊 Generating Prisma client..."
npx prisma generate --schema "$PRISMA_SCHEMA_PATH"

echo "📊 Applying Prisma migrations..."
npx prisma migrate deploy --schema "$PRISMA_SCHEMA_PATH" || true
echo "ℹ️ Ensuring schema is applied (db push)..."
npx prisma db push --schema "$PRISMA_SCHEMA_PATH" --accept-data-loss || true

export NODE_OPTIONS="--dns-result-order=ipv4first"

echo "🌐 Starting frontend server on port ${FRONTEND_PORT:-3000}..."
cd /app/client && PORT=${FRONTEND_PORT:-3000} npm start &
FRONTEND_PID=$!

sleep 2

echo "🔧 Starting backend server on port ${BACKEND_PORT:-4000}..."
cd /app && PORT=${BACKEND_PORT:-4000} AUTH_ENABLED=${AUTH_ENABLED} DATABASE_URL=${DATABASE_URL} node server/database-backend.js &
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


