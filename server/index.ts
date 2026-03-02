import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { scrapeNBAPlayers } from "./scraper";
import { syncPlayerInfoFromPostgres } from "./syncPlayerInfo";
import { pool } from "./db";
import { storage } from "./storage";

/** Create site_settings table if missing (e.g. production DB never ran full schema push). */
async function ensureSiteSettingsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        "key" TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  } catch (err: unknown) {
    console.warn("Could not ensure site_settings table:", (err as Error)?.message ?? err);
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
        await ensureSiteSettingsTable();
      } catch {
        // non-fatal
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
