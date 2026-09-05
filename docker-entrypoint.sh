#!/bin/sh
set -e

# If DATABASE_URL is provided, run prisma db push to ensure PostgreSQL tables exist
if [ -n "$DATABASE_URL" ]; then
  echo "[clip-app] Connecting to database and synchronizing schema..."
  npx prisma db push --skip-generate || echo "[clip-app] Notice: Database sync was skipped or failed. Continuing server launch."
fi

exec "$@"
