#!/usr/bin/env bash
# Import the Replit Talent Academy database into local Postgres.
# Usage:
#   REPLIT_DATABASE_URL='postgresql://...' bash scripts/import-replit-db.sh
#   bash scripts/import-replit-db.sh /path/to/replit.dump
set -euo pipefail

LOCAL_URL="postgresql:///talent_academy?host=/var/run/postgresql"
BACKUP="/tmp/talent-academy-local-before-replit.dump"
TARGET_DUMP="${1:-/tmp/replit-talent-academy.dump}"

echo "Backing up current local database to $BACKUP"
pg_dump --format=custom --no-owner --no-acl "$LOCAL_URL" > "$BACKUP"

if [[ -n "${REPLIT_DATABASE_URL:-}" ]]; then
  echo "Downloading Replit database..."
  pg_dump --format=custom --no-owner --no-acl "$REPLIT_DATABASE_URL" > "$TARGET_DUMP"
elif [[ -f "$TARGET_DUMP" ]]; then
  echo "Using dump file $TARGET_DUMP"
else
  echo "Provide REPLIT_DATABASE_URL or a dump file path."
  exit 1
fi

echo "Restoring Replit data into local talent_academy"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$LOCAL_URL" "$TARGET_DUMP"
echo "Import complete. Previous local copy is at $BACKUP"
