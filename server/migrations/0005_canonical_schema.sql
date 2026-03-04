-- Canonical sports-database schema (scrapers write here; sync copies to player_info/player_stats).

-- Core identity: one row per player
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  birth_date TEXT,
  height TEXT NOT NULL DEFAULT '—',
  weight TEXT NOT NULL DEFAULT '—',
  position TEXT NOT NULL DEFAULT 'G',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS players_slug_key ON players (slug);

-- External IDs for scrapers (prevents duplicate players)
CREATE TABLE IF NOT EXISTS player_external_ids (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, external_id)
);

CREATE INDEX IF NOT EXISTS player_external_ids_player_id ON player_external_ids(player_id);
CREATE INDEX IF NOT EXISTS player_external_ids_lookup ON player_external_ids(source, external_id);

-- Leagues
CREATE TABLE IF NOT EXISTS leagues (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT DEFAULT 'USA',
  level TEXT
);

INSERT INTO leagues (id, name, country, level) VALUES (1, 'NCAA', 'USA', 'college'), (2, 'NBA', 'USA', 'pro'), (3, 'G League', 'USA', 'pro')
ON CONFLICT (id) DO NOTHING;

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  school TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_league_slug ON teams(league_id, slug);

-- Seasons
CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  year_start INTEGER NOT NULL,
  year_end INTEGER NOT NULL,
  label TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS seasons_label ON seasons(label);

-- Player seasons (where a player played)
CREATE TABLE IF NOT EXISTS player_seasons (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  jersey INTEGER DEFAULT 0,
  games INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, team_id, season_id)
);

CREATE INDEX IF NOT EXISTS player_seasons_player_id ON player_seasons(player_id);
CREATE INDEX IF NOT EXISTS player_seasons_team_season ON player_seasons(team_id, season_id);

-- Per-season stats
CREATE TABLE IF NOT EXISTS player_season_stats (
  id SERIAL PRIMARY KEY,
  player_season_id INTEGER NOT NULL REFERENCES player_seasons(id) ON DELETE CASCADE,
  pts_per_g NUMERIC NOT NULL DEFAULT 0,
  trb_per_g NUMERIC NOT NULL DEFAULT 0,
  ast_per_g NUMERIC NOT NULL DEFAULT 0,
  stl_per_g NUMERIC NOT NULL DEFAULT 0,
  blk_per_g NUMERIC NOT NULL DEFAULT 0,
  fg_pct NUMERIC NOT NULL DEFAULT 0,
  fg3_pct NUMERIC,
  ft_pct NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_season_id)
);

CREATE INDEX IF NOT EXISTS player_season_stats_player_season ON player_season_stats(player_season_id);
