#!/usr/bin/env bash
#
# cleanTargetSchema.sh — Drop every table in Hoop Central (target), then re-apply
# schema.sql so it only has the 2.0 tables. Removes any leftover/duplicate tables.
# Usage: TARGET_DATABASE_URL=... ./scripts/cleanTargetSchema.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMA_FILE="$PROJECT_ROOT/schema.sql"

if [[ -z "${TARGET_DATABASE_URL:-}" ]]; then
  echo "Error: TARGET_DATABASE_URL is not set." >&2
  exit 1
fi

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "Error: schema.sql not found at $SCHEMA_FILE. Run copySchema.sh first." >&2
  exit 1
fi

echo "→ Dropping public schema (removes all tables) on target..."
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
"

echo "→ Re-applying schema.sql (2.0 tables only)..."
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE"

echo "→ Done. Target database now has only the 2.0 schema tables."
