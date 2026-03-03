# Database migrations

Run against your Postgres database when needed (e.g. after pull or on a new environment).

## 0001_player_stats_league.sql

Ensures `player_stats.league` exists so NCAA scraper and `/api/leagues/NCAA/teams` work.

## 0002_player_stats_columns.sql

Adds missing stat columns to `player_stats` if you see errors like **"column games_played does not exist"**. Ensures `games_played`, `ppg`, `rpg`, `apg`, `spg`, `bpg`, `fg_pct` exist with correct types (integer/numeric). Required for both NBA and NCAA scrapers.

**From project root (with DATABASE_URL or PG vars set):**
```bash
psql "$DATABASE_URL" -f server/migrations/0001_player_stats_league.sql
psql "$DATABASE_URL" -f server/migrations/0002_player_stats_columns.sql
```

**Or from Railway:** run the contents of each file in the Railway Postgres query tab (or psql).

**Note:** Upserts use `player_id`, `season`, `team`, and `league` (SELECT then INSERT or UPDATE). There is no `player_name` column in `player_stats`.
