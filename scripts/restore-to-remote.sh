#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="${SUPABASE_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$TARGET_URL" ]]; then
  echo "Set SUPABASE_DATABASE_URL (or DATABASE_URL) to the Supabase pooler URI first."
  exit 1
fi

DUMP="${1:-/tmp/talent-academy-local.dump}"
echo "Dumping local talent_academy to $DUMP"
pg_dump --format=custom --no-owner --no-acl \
  "postgresql:///talent_academy?host=/var/run/postgresql" > "$DUMP"

echo "Restoring into remote Postgres"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$TARGET_URL" "$DUMP"
echo "Done."
