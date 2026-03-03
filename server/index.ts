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
      startWeeklyScraperSchedule();
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
        log(`Scheduled scrape complete! Added: ${result.playersAdded}, Updated: ${result.playersUpdated}, Stats: ${result.statsUpdated}, Seasons: ${result.seasonsProcessed.join(', ')}`, "scheduler");
      } catch (err: any) {
        log(`Scheduled scrape failed: ${err?.message ?? String(err)}`, "scheduler");
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
