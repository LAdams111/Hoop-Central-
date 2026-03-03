-- Ensure player_stats has a league column (NCAA scraper and /api/leagues/:league/teams depend on it).
-- Safe to run multiple times (IF NOT EXISTS).
-- Existing rows get default 'NBA'; NCAA inserts set league = 'NCAA' explicitly.

ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS league text;
-- Set default for new rows if column was just added (Postgres keeps existing NULLs; new rows get default)
ALTER TABLE player_stats ALTER COLUMN league SET DEFAULT 'NBA';
-- Backfill any NULLs (e.g. from before column existed)
UPDATE player_stats SET league = 'NBA' WHERE league IS NULL;
