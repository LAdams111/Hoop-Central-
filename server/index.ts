import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { scrapeNBAPlayers } from "./scraper";
import { updateCurrentSeasonStandings } from "./standings";
import { syncPlayerInfoFromPostgres } from "./syncPlayerInfo";
import { pool } from "./db";
import { storage } from "./storage";

/** Create site_settings table if missing and ensure it has "key" and value columns (e.g. production DB may have different schema). */
async function ensureSiteSettingsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        "key" TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    await pool.query(`
      ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS "key" TEXT;
    `);
    await pool.query(`
      ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS value TEXT NOT NULL DEFAULT '';
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS site_settings_key_idx ON site_settings ("key");
    `);
  } catch (err: unknown) {
    console.warn("Could not ensure site_settings table:", (err as Error)?.message ?? err);
  }
}

/** Add profile_views column to player_info if missing (e.g. Railway DB created from external table without it). */
async function ensurePlayerInfoProfileViewsColumn(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE player_info
      ADD COLUMN IF NOT EXISTS profile_views INTEGER NOT NULL DEFAULT 50
    `);
  } catch (err: unknown) {
    console.warn("Could not ensure player_info.profile_views column:", (err as Error)?.message ?? err);
  }
}

/** Add profile_views to canonical players table if missing (for NBA view count 13500–16500). */
async function ensureCanonicalPlayersProfileViewsColumn(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE players
      ADD COLUMN IF NOT EXISTS profile_views INTEGER NOT NULL DEFAULT 50
    `);
  } catch (err: unknown) {
    console.warn("Could not ensure players.profile_views column:", (err as Error)?.message ?? err);
  }
}

/** Set profile_views to 13500–16500 for players who have played in the NBA and currently have views < 13500. */
async function backfillCanonicalNbaProfileViews(): Promise<number> {
  try {
    const res = await pool.query(`
      WITH nba_player_ids AS (
        SELECT DISTINCT ps.player_id AS id
        FROM player_seasons ps
        INNER JOIN team_seasons ts ON ts.id = ps.team_season_id
        INNER JOIN seasons s ON s.id = ts.season_id
        INNER JOIN leagues l ON l.id = s.league_id
        WHERE LOWER(TRIM(l.name)) = 'nba'
      )
      UPDATE players
      SET profile_views = 13500 + FLOOR(RANDOM() * 3001)::int
      FROM nba_player_ids
      WHERE players.id = nba_player_ids.id
        AND (players.profile_views IS NULL OR players.profile_views < 13500)
    `);
    return res.rowCount ?? 0;
  } catch {
    return 0;
  }
}

/** Add headshot_url and other optional columns to player_info if missing (e.g. Railway DB created without them). Avoids 42703 on updatePlayer. */
async function ensurePlayerInfoHeadshotUrlColumn(): Promise<void> {
  const columns = [
    { name: "headshot_url", sql: "ADD COLUMN IF NOT EXISTS headshot_url TEXT NOT NULL DEFAULT ''" },
    { name: "bio", sql: "ADD COLUMN IF NOT EXISTS bio TEXT" },
    { name: "hometown", sql: "ADD COLUMN IF NOT EXISTS hometown TEXT" },
    { name: "birth_date", sql: "ADD COLUMN IF NOT EXISTS birth_date TEXT" },
  ];
  for (const col of columns) {
    try {
      await pool.query(`ALTER TABLE player_info ${col.sql}`);
    } catch (err: unknown) {
      console.warn(`Could not ensure player_info.${col.name}:`, (err as Error)?.message ?? err);
    }
  }
}

/** Create team_records table if missing so seed and standings can insert. Without this, production may have no W-L data. */
async function ensureTeamRecordsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_records (
        id SERIAL PRIMARY KEY,
        team TEXT NOT NULL,
        season TEXT NOT NULL,
        wins INTEGER NOT NULL,
        losses INTEGER NOT NULL,
        league TEXT NOT NULL DEFAULT 'NBA'
      )
    `);
  } catch (err: unknown) {
    console.warn("Could not ensure team_records table:", (err as Error)?.message ?? err);
  }
}

/** Ensure canonical schema (players, player_external_ids, leagues, teams, seasons, player_seasons, player_season_stats) exists. */
async function ensureCanonicalSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      birth_date TEXT,
      height TEXT NOT NULL DEFAULT '—',
      weight TEXT NOT NULL DEFAULT '—',
      position TEXT NOT NULL DEFAULT 'G',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS players_slug_key ON players (slug)`,
    `CREATE TABLE IF NOT EXISTS player_external_ids (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(source, external_id)
    )`,
    `CREATE INDEX IF NOT EXISTS player_external_ids_player_id ON player_external_ids(player_id)`,
    `CREATE INDEX IF NOT EXISTS player_external_ids_lookup ON player_external_ids(source, external_id)`,
    `CREATE TABLE IF NOT EXISTS leagues (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT DEFAULT 'USA',
      level TEXT
    )`,
    `INSERT INTO leagues (id, name, country, level) VALUES (1, 'NCAA', 'USA', 'college'), (2, 'NBA', 'USA', 'pro'), (3, 'G League', 'USA', 'pro') ON CONFLICT (id) DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      school TEXT,
      city TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS teams_league_slug ON teams(league_id, slug)`,
    `CREATE TABLE IF NOT EXISTS seasons (
      id SERIAL PRIMARY KEY,
      year_start INTEGER NOT NULL,
      year_end INTEGER NOT NULL,
      label TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS seasons_label ON seasons(label)`,
    `CREATE TABLE IF NOT EXISTS player_seasons (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      jersey INTEGER DEFAULT 0,
      games INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(player_id, team_id, season_id)
    )`,
    `CREATE TABLE IF NOT EXISTS player_season_stats (
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
    )`,
  ];
  for (const sql of statements) {
    try {
      await pool.query(sql);
    } catch (err: unknown) {
      console.warn("Could not run canonical schema statement:", (err as Error)?.message ?? err);
    }
  }
}

/** Repair player_info: set player_id = id where player_id IS NULL so joins with player_stats work (p.id = s.player_id). */
async function repairPlayerInfoPlayerIdNulls(): Promise<void> {
  try {
    const res = await pool.query("UPDATE player_info SET player_id = id WHERE player_id IS NULL");
    if (res.rowCount != null && res.rowCount > 0) {
      console.log(`[startup] Repaired ${res.rowCount} player_info rows: set player_id = id`);
    }
  } catch (err: unknown) {
    console.warn("Could not repair player_info.player_id (column may not exist or type differs):", (err as Error)?.message ?? err);
  }
}

/** Return true if legacy table player_stats exists (canonical-only DBs like Railway may not have it). */
async function playerStatsTableExists(): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ n: number }>(
      "SELECT 1 AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'player_stats' LIMIT 1"
    );
    return (rows?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Repair player_stats: set player_id = player_info.id for any row where player_id matches player_info.player_id (string).
 * This fixes stats that were stored with string ids (e.g. "bradtma01") so they show on the correct player profile.
 * Uses ::text casts so the comparison works whether player_stats.player_id is integer or text in the DB. */
async function repairPlayerStatsPlayerIds(): Promise<void> {
  try {
    const res = await pool.query(`
      UPDATE player_stats ps
      SET player_id = pi.id
      FROM player_info pi
      WHERE trim(pi.player_id::text) <> ''
        AND ps.player_id::text = trim(pi.player_id::text)
        AND (ps.player_id::text IS DISTINCT FROM pi.id::text)
    `);
    if (res.rowCount != null && res.rowCount > 0) {
      console.log(`[startup] Repaired ${res.rowCount} player_stats rows: linked to player_info.id`);
    }
  } catch (err: unknown) {
    console.warn("Could not repair player_stats.player_id (player_info.player_id may not exist or type differs):", (err as Error)?.message ?? err);
  }
}

/** Ensure player_stats.player_id is INTEGER so joins with player_info.id don't hit integer = text errors. */
async function ensurePlayerStatsPlayerIdInteger(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE player_stats
      ALTER COLUMN player_id TYPE INTEGER USING (player_id::integer)
    `);
    console.log("[startup] player_stats.player_id is INTEGER");
  } catch (err: unknown) {
    console.warn("Could not alter player_stats.player_id to INTEGER (may already be integer or have non-numeric values):", (err as Error)?.message ?? err);
  }
}

/** Ensure player_stats has columns required by NCAA/NBA scrapers. Uses NBA-style names: pts_per_g, trb_per_g, etc. */
async function ensurePlayerStatsColumns(): Promise<void> {
  const alters = [
    "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS games_played INTEGER",
    "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS pts_per_g NUMERIC",
    "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS trb_per_g NUMERIC",
    "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS ast_per_g NUMERIC",
    "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS stl_per_g NUMERIC",
    "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS blk_per_g NUMERIC",
    "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS fg_pct NUMERIC",
  ];
  for (const sql of alters) {
    try {
      await pool.query(sql);
    } catch (err: unknown) {
      console.warn("Could not ensure player_stats column:", (err as Error)?.message ?? err);
    }
  }
}

/** Ensure player_stats.season is TEXT (for NCAA "2025-26"). Run on startup if column was created as INTEGER. */
async function ensurePlayerStatsSeasonText(): Promise<void> {
  try {
    await pool.query(`ALTER TABLE player_stats ALTER COLUMN season TYPE TEXT USING season::text`);
  } catch (err: unknown) {
    console.warn("Could not alter player_stats.season to TEXT:", (err as Error)?.message ?? err);
  }
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Ensure team_records exists before registerRoutes so seedDatabase can insert W-L data
  if (process.env.DATABASE_URL || process.env.RAILWAY_POSTGRESQL_URL || process.env.PGHOST) {
    try {
      await ensureTeamRecordsTable();
    } catch {
      // non-fatal
    }
    try {
      await ensureCanonicalSchema();
    } catch {
      // non-fatal
    }
  }
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  try {
    await ensureSiteSettingsTable();
  } catch {
    // non-fatal
  }
  try {
    await ensurePlayerInfoProfileViewsColumn();
  } catch {
    // non-fatal
  }
  try {
    await ensurePlayerInfoHeadshotUrlColumn();
  } catch {
    // non-fatal
  }
  try {
    await ensureCanonicalPlayersProfileViewsColumn();
    const backfillCount = await backfillCanonicalNbaProfileViews();
    if (backfillCount > 0) {
      log(`Canonical NBA profile views backfill: ${backfillCount} player(s) set to 13500–16500`, "startup");
    }
  } catch {
    // non-fatal
  }
  try {
    await repairPlayerInfoPlayerIdNulls();
  } catch {
    // non-fatal
  }
  try {
    const hasPlayerStats = await playerStatsTableExists();
    if (hasPlayerStats) {
      await repairPlayerStatsPlayerIds();
      await ensurePlayerStatsPlayerIdInteger();
      await ensurePlayerStatsColumns();
      await ensurePlayerStatsSeasonText();
    }
  } catch {
    // non-fatal
  }
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    async () => {
      log(`serving on port ${port}`);
      if (!process.env.DATABASE_URL && !process.env.RAILWAY_POSTGRESQL_URL) {
        log("Warning: DATABASE_URL not set — connect to Railway Postgres and set DATABASE_URL in Variables", "startup");
      }
      try {
        const syncResult = await syncPlayerInfoFromPostgres();
        if (syncResult.created > 0 || syncResult.updated > 0) {
          log(`Startup sync: ${syncResult.created} players created, ${syncResult.updated} updated`, "startup");
        }
      } catch (err: any) {
        log(`Startup sync skipped: ${err?.message ?? String(err)}`, "startup");
      }
      try {
        const backfillUpdated = await storage.backfillNbaProfileViews();
        if (backfillUpdated > 0) {
          log(`NBA profile views backfill: ${backfillUpdated} player(s) updated`, "startup");
        }
      } catch (err: any) {
        log(`NBA profile views backfill skipped: ${err?.message ?? String(err)}`, "startup");
      }
      try {
        const { getCurrentSeasonForStandings, updateStandingsForAllSeasons } = await import("./standings");
        const currentSeason = getCurrentSeasonForStandings();
        const zeroed = await storage.setHistoricalNbaRecordsToZero(currentSeason);
        if (zeroed > 0) {
          log(`Zeroed ${zeroed} historical NBA records (non-${currentSeason}) to 0-0`, "startup");
        }
        updateStandingsForAllSeasons().then((r) => {
          if (r.totalUpdated > 0 || r.totalInserted > 0) {
            log(`Standings backfill: ${r.totalUpdated} updated, ${r.totalInserted} inserted across ${r.seasons.length} seasons`, "startup");
          }
        }).catch((err: any) => {
          log(`Standings backfill skipped: ${err?.message ?? String(err)}`, "startup");
        });
        import("./teamRecordsScraper").then(({ scrapeAllTeamRecordsFromBR }) => {
          scrapeAllTeamRecordsFromBR().then((r) => {
            if (r.totalUpdated > 0 || r.totalInserted > 0) {
              log(`BR team records: ${r.totalUpdated} updated, ${r.totalInserted} inserted`, "startup");
            }
          }).catch((err: any) => {
            log(`BR team records scraper skipped: ${err?.message ?? String(err)}`, "startup");
          });
        });
        // Scraper in this repo is disabled — do not run NCAA/NBA scrapers on startup or schedule.
      } catch (err: any) {
        log(`Zero historical records skipped: ${err?.message ?? String(err)}`, "startup");
      }
      // startWeeklyScraperSchedule(); — disabled
      startPlayerInfoSyncSchedule();
      startDailyStandingsSchedule();
    },
  );
})();

function startWeeklyScraperSchedule() {
  function msUntilNextSunday6AM() {
    const now = new Date();
    const next = new Date(now);

    // 0 = Sunday; compute days until next Sunday
    const day = now.getDay();
    const daysUntilSunday = (7 - day) % 7;
    next.setDate(now.getDate() + daysUntilSunday);
    next.setHours(6, 0, 0, 0);

    // If it's already past Sunday 6:00 AM today, schedule for next week
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 7);
    }

    return next.getTime() - now.getTime();
  }

  async function scheduleNext() {
    const ms = msUntilNextSunday6AM();
    const hours = Math.round((ms / 1000 / 60 / 60) * 10) / 10;
    log(`Next auto-scrape scheduled in ${hours} hours (Sunday 6:00 AM)`, "scheduler");

    setTimeout(async () => {
      log("Starting scheduled weekly NBA scrape...", "scheduler");
      try {
        const result = await scrapeNBAPlayers();
        log(`Scheduled scrape complete! Added: ${result.playersAdded}, Matched: ${result.playersMatched}, Stats: ${result.statsInserted} inserted, ${result.statsUpdated} updated, Seasons: ${result.seasonsProcessed.join(', ')}`, "scheduler");
      } catch (err: any) {
        log(`Scheduled scrape failed: ${err?.message ?? String(err)}`, "scheduler");
      }
      try {
        const { scrapeAllTeamRecordsFromBR } = await import("./teamRecordsScraper");
        const brResult = await scrapeAllTeamRecordsFromBR();
        if (brResult.totalUpdated > 0 || brResult.totalInserted > 0) {
          log(`BR team records: ${brResult.totalUpdated} updated, ${brResult.totalInserted} inserted`, "scheduler");
        }
      } catch (err: any) {
        log(`BR team records scrape skipped: ${err?.message ?? String(err)}`, "scheduler");
      }
      try {
        const { runNcaaScraper, isNcaaScraperRunning } = await import("./scrapers/ncaaScraper");
        if (!isNcaaScraperRunning()) {
          log("Starting scheduled NCAA scrape (light: 20 schools, last 4 seasons)...", "scheduler");
          const ncaaResult = await runNcaaScraper({ maxSchools: 20 });
          log(`NCAA scrape done: ${ncaaResult.schoolsProcessed} pages, ${ncaaResult.playersAdded} new, ${ncaaResult.statsInserted} stats inserted`, "scheduler");
        }
      } catch (err: any) {
        log(`NCAA scrape skipped: ${err?.message ?? String(err)}`, "scheduler");
      }
      // schedule the next run
      void scheduleNext();
    }, ms);
  }

  void scheduleNext();
}

/** Every 5 minutes, sync from Postgres "Player info" table into players (so new rows get profiles). */
function startPlayerInfoSyncSchedule() {
  const INTERVAL_MS = 5 * 60 * 1000;
  setInterval(async () => {
    try {
      const result = await syncPlayerInfoFromPostgres();
      if (result.created > 0 || result.updated > 0) {
        log(`Player info sync: ${result.created} created, ${result.updated} updated`, "sync");
      }
      if (result.errors.length > 0) {
        log(`Player info sync errors: ${result.errors.slice(0, 3).join("; ")}`, "sync");
      }
    } catch (err: any) {
      log(`Player info sync failed: ${err?.message ?? String(err)}`, "sync");
    }
  }, INTERVAL_MS);
  log("Player info sync scheduled every 5 minutes", "sync");
}

/** Once per day, fetch current NBA season standings and upsert team_records so W-L stays up to date. */
function startDailyStandingsSchedule() {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  async function run() {
    log("Starting daily current-season standings update...", "standings");
    try {
      const result = await updateCurrentSeasonStandings();
      log(
        `Standings update complete: ${result.season} — ${result.updated} updated, ${result.inserted} inserted`,
        "standings"
      );
      if (result.errors.length > 0) {
        log(`Standings errors: ${result.errors.slice(0, 3).join("; ")}`, "standings");
      }
    } catch (err: any) {
      log(`Standings update failed: ${err?.message ?? String(err)}`, "standings");
    }
  }

  // First run 1 minute after startup so DB and app are ready
  setTimeout(() => void run(), 60 * 1000);
  // Then every 24 hours
  setInterval(() => void run(), TWENTY_FOUR_HOURS_MS);
  log("Daily standings update scheduled (first in 1 min, then every 24h)", "standings");
}
