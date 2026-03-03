-- player_stats.season must be TEXT for NCAA seasons like "2025-26". If the column was created as INTEGER, change it.
ALTER TABLE player_stats
ALTER COLUMN season TYPE TEXT USING season::text;
