-- Reference: expected player_stats schema for NBA + NCAA scrapers.
-- Use this only if creating the table from scratch. Otherwise run migrations 0001 and 0002.
-- Upserts are done in app code via SELECT then INSERT or UPDATE (key: player_id, season, team, league).
-- There is no player_name column; player identity is player_id (FK to player_info.id).

CREATE TABLE IF NOT EXISTS player_stats (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  season TEXT NOT NULL,
  team TEXT NOT NULL DEFAULT 'NBA',
  league TEXT NOT NULL DEFAULT 'NBA',
  games_played INTEGER NOT NULL DEFAULT 0,
  ppg NUMERIC NOT NULL DEFAULT '0',
  rpg NUMERIC NOT NULL DEFAULT '0',
  apg NUMERIC NOT NULL DEFAULT '0',
  spg NUMERIC NOT NULL DEFAULT '0',
  bpg NUMERIC NOT NULL DEFAULT '0',
  fg_pct NUMERIC NOT NULL DEFAULT '0'
);
