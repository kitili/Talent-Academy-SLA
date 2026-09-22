#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL to the Neon/production connection string first."
  exit 1
fi

DUMP="${1:-/tmp/talent-academy-local.dump}"
echo "Dumping local talent_academy to $DUMP"
pg_dump --format=custom --no-owner --no-acl \
  "postgresql:///talent_academy?host=/var/run/postgresql" > "$DUMP"

echo "Restoring into remote DATABASE_URL"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$DATABASE_URL" "$DUMP"
echo "Done."
