/**
 * Clear all WNBA data from canonical tables and rescrape from Basketball Reference.
 * Run with: npx tsx server/scripts/wnba-clear-and-rescrape.ts
 * Requires DATABASE_URL (or RAILWAY_POSTGRESQL_URL). Uses same tables as NBA scraper.
 */
import { clearWnbaData, scrapeWNBAPlayers } from "../scrapers/wnbaScraper";
import { pool } from "../db";

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.RAILWAY_POSTGRESQL_URL;
  if (!connectionString) {
    console.error("Set DATABASE_URL or RAILWAY_POSTGRESQL_URL.");
    process.exit(1);
  }

  console.log("Clearing existing WNBA data...");
  const clearResult = await clearWnbaData();
  if (clearResult.error) {
    console.error("Clear failed:", clearResult.error);
    process.exit(1);
  }
  console.log("  player_season_stats deleted:", clearResult.playerSeasonStatsDeleted);
  console.log("  player_seasons deleted:", clearResult.playerSeasonsDeleted);
  console.log("  player_external_ids deleted:", clearResult.playerExternalIdsDeleted);
  console.log("  players deleted:", clearResult.playersDeleted);

  console.log("Rescraping WNBA players...");
  const scrapeResult = await scrapeWNBAPlayers({});
  console.log("  playersAdded:", scrapeResult.playersAdded);
  console.log("  playersMatched:", scrapeResult.playersMatched);
  console.log("  statsInserted:", scrapeResult.statsInserted);
  console.log("  statsUpdated:", scrapeResult.statsUpdated);
  console.log("  seasonsProcessed:", scrapeResult.seasonsProcessed.length);
  if (scrapeResult.errors.length) console.log("  errors:", scrapeResult.errors.length);

  await pool.end();
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
