#!/usr/bin/env bash
#
# dropOldTables.sh — Drop only the OLD tables (player_info, player_stats, awards, team_records, site_settings).
# Leaves the 2.0 canonical tables intact. Run once; then db:push will no longer recreate old tables.
# Usage: DATABASE_URL=... ./scripts/dropOldTables.sh
#

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL is not set." >&2
  echo "Usage: DATABASE_URL='postgresql://...' $0" >&2
  exit 1
fi

echo "→ Dropping old tables (player_info, player_stats, awards, team_records, site_settings)..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
DROP TABLE IF EXISTS player_stats CASCADE;
DROP TABLE IF EXISTS awards CASCADE;
DROP TABLE IF EXISTS player_info CASCADE;
DROP TABLE IF EXISTS team_records CASCADE;
DROP TABLE IF EXISTS site_settings CASCADE;
"

echo "→ Done. Only 2.0 tables remain (leagues, teams, seasons, team_seasons, players, player_external_ids, player_seasons, player_season_stats, player_scrape_jobs)."
