#!/usr/bin/env bash
#
# copySchema.sh — Copy database schema (structure only) from SOURCE to TARGET.
# Usage: SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... ./scripts/copySchema.sh
#

set -euo pipefail

# Resolve project root (directory containing this script's parent)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMA_FILE="$PROJECT_ROOT/schema.sql"

# --- Validate required environment variables ---
if [[ -z "${SOURCE_DATABASE_URL:-}" ]]; then
  echo "Error: SOURCE_DATABASE_URL is not set." >&2
  echo "Usage: SOURCE_DATABASE_URL=<url> TARGET_DATABASE_URL=<url> $0" >&2
  exit 1
fi

if [[ -z "${TARGET_DATABASE_URL:-}" ]]; then
  echo "Error: TARGET_DATABASE_URL is not set." >&2
  echo "Usage: SOURCE_DATABASE_URL=<url> TARGET_DATABASE_URL=<url> $0" >&2
  exit 1
fi

echo "→ Exporting schema from source database (with --clean --if-exists for target reset)..."
pg_dump "$SOURCE_DATABASE_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  -f "$SCHEMA_FILE"

echo "→ Schema saved to $SCHEMA_FILE"
echo "→ Applying schema to target database..."
psql "$TARGET_DATABASE_URL" -f "$SCHEMA_FILE"

echo "→ Done. Schema copied from source to target."
