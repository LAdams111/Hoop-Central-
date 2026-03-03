-- Ensure player_stats has all columns required by NCAA and NBA scrapers.
-- Run if you see "column games_played does not exist" or similar.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- Types match shared/schema.ts: player_stats (games_played integer, ppg/rpg/apg/spg/bpg/fg_pct numeric).

-- Core stat columns (used by both NBA and NCAA)
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS games_played INTEGER;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS ppg NUMERIC;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS rpg NUMERIC;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS apg NUMERIC;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS spg NUMERIC;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS bpg NUMERIC;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS fg_pct NUMERIC;

-- Backfill defaults for new columns so existing rows are valid (optional)
UPDATE player_stats SET games_played = 0 WHERE games_played IS NULL;
UPDATE player_stats SET ppg = '0' WHERE ppg IS NULL;
UPDATE player_stats SET rpg = '0' WHERE rpg IS NULL;
UPDATE player_stats SET apg = '0' WHERE apg IS NULL;
UPDATE player_stats SET spg = '0' WHERE spg IS NULL;
UPDATE player_stats SET bpg = '0' WHERE bpg IS NULL;
UPDATE player_stats SET fg_pct = '0' WHERE fg_pct IS NULL;

-- Add NOT NULL defaults for future inserts (only if column was just added; avoid breaking existing data)
ALTER TABLE player_stats ALTER COLUMN games_played SET DEFAULT 0;
ALTER TABLE player_stats ALTER COLUMN ppg SET DEFAULT '0';
ALTER TABLE player_stats ALTER COLUMN rpg SET DEFAULT '0';
ALTER TABLE player_stats ALTER COLUMN apg SET DEFAULT '0';
ALTER TABLE player_stats ALTER COLUMN spg SET DEFAULT '0';
ALTER TABLE player_stats ALTER COLUMN bpg SET DEFAULT '0';
ALTER TABLE player_stats ALTER COLUMN fg_pct SET DEFAULT '0';
