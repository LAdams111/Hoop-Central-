-- Use NBA-style column names for player_stats so NCAA and NBA data share the same layout.
-- Adds pts_per_g, trb_per_g, ast_per_g, stl_per_g, blk_per_g if missing; backfills from ppg/rpg/etc. if present.

ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS pts_per_g NUMERIC;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS trb_per_g NUMERIC;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS ast_per_g NUMERIC;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS stl_per_g NUMERIC;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS blk_per_g NUMERIC;

-- Backfill from old column names if new columns are null
UPDATE player_stats SET pts_per_g = ppg WHERE pts_per_g IS NULL AND ppg IS NOT NULL;
UPDATE player_stats SET trb_per_g = rpg WHERE trb_per_g IS NULL AND rpg IS NOT NULL;
UPDATE player_stats SET ast_per_g = apg WHERE ast_per_g IS NULL AND apg IS NOT NULL;
UPDATE player_stats SET stl_per_g = spg WHERE stl_per_g IS NULL AND spg IS NOT NULL;
UPDATE player_stats SET blk_per_g = bpg WHERE blk_per_g IS NULL AND bpg IS NOT NULL;

-- Set defaults for new columns so NOT NULL works
UPDATE player_stats SET pts_per_g = '0' WHERE pts_per_g IS NULL;
UPDATE player_stats SET trb_per_g = '0' WHERE trb_per_g IS NULL;
UPDATE player_stats SET ast_per_g = '0' WHERE ast_per_g IS NULL;
UPDATE player_stats SET stl_per_g = '0' WHERE stl_per_g IS NULL;
UPDATE player_stats SET blk_per_g = '0' WHERE blk_per_g IS NULL;

ALTER TABLE player_stats ALTER COLUMN pts_per_g SET DEFAULT '0';
ALTER TABLE player_stats ALTER COLUMN trb_per_g SET DEFAULT '0';
ALTER TABLE player_stats ALTER COLUMN ast_per_g SET DEFAULT '0';
ALTER TABLE player_stats ALTER COLUMN stl_per_g SET DEFAULT '0';
ALTER TABLE player_stats ALTER COLUMN blk_per_g SET DEFAULT '0';
