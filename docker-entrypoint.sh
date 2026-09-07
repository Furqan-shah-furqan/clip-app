#!/bin/sh
set -e

# If DATABASE_URL is provided, run prisma db push to ensure PostgreSQL tables exist
if [ -n "$DATABASE_URL" ]; then
  echo "[clip-app] Connecting to database and synchronizing schema..."
  npx prisma db push --skip-generate || echo "[clip-app] Notice: Database sync was skipped or failed. Continuing server launch."
fi

# Ensure uploads directory exists and copy read-only secret cookies to writable uploads/cookies.txt
mkdir -p /app/uploads
if [ -f "/etc/secrets/cookies.txt" ]; then
  echo "[clip-app] Syncing /etc/secrets/cookies.txt to /app/uploads/cookies.txt..."
  cp /etc/secrets/cookies.txt /app/uploads/cookies.txt || true
  chmod 666 /app/uploads/cookies.txt || true
elif [ -f "/etc/secrets/youtube_cookies.txt" ]; then
  echo "[clip-app] Syncing /etc/secrets/youtube_cookies.txt to /app/uploads/cookies.txt..."
  cp /etc/secrets/youtube_cookies.txt /app/uploads/cookies.txt || true
  chmod 666 /app/uploads/cookies.txt || true
fi

exec "$@"
