# Database migrations

Run against your Postgres database when needed (e.g. after pull or on a new environment).

## 0001_player_stats_league.sql

Ensures `player_stats.league` exists so NCAA scraper and `/api/leagues/NCAA/teams` work.

## 0002_player_stats_columns.sql

Adds missing stat columns to `player_stats` if you see errors like **"column games_played does not exist"**. Ensures `games_played`, `ppg`, `rpg`, `apg`, `spg`, `bpg`, `fg_pct` exist with correct types (integer/numeric). Required for both NBA and NCAA scrapers.

## 0003_player_stats_season_text.sql

Changes `player_stats.season` to TEXT so NCAA seasons like `"2025-26"` work. Run if you see **invalid input syntax for type integer: "2025–26"**. Uses `USING season::text` so existing integer values convert safely. ON CONFLICT (if used) works with season as TEXT.

## 0004_player_stats_pts_per_g_columns.sql

Adds NBA-style columns `pts_per_g`, `trb_per_g`, `ast_per_g`, `stl_per_g`, `blk_per_g` and backfills from `ppg`, `rpg`, etc. so NCAA and NBA stats use the same layout. Run once when aligning with the updated schema.

**From project root (with DATABASE_URL or PG vars set):**
```bash
psql "$DATABASE_URL" -f server/migrations/0001_player_stats_league.sql
psql "$DATABASE_URL" -f server/migrations/0002_player_stats_columns.sql
psql "$DATABASE_URL" -f server/migrations/0003_player_stats_season_text.sql
psql "$DATABASE_URL" -f server/migrations/0004_player_stats_pts_per_g_columns.sql
```

**Or from Railway:** run the contents of each file in the Railway Postgres query tab (or psql).

**Note:** Upserts use `player_id`, `season`, `team`, and `league` (SELECT then INSERT or UPDATE). There is no `player_name` column in `player_stats`.
