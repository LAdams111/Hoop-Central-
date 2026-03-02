/**
 * One-time script: backfill profile_views for all players with NBA stats and views < 10000.
 * Run with: npx tsx server/scripts/backfill-nba-views.ts
 * Requires DATABASE_URL (or RAILWAY_POSTGRESQL_URL) in env.
 */
import { storage } from "../storage";

async function main() {
  console.log("Running NBA profile views backfill...");
  const updated = await storage.backfillNbaProfileViews();
  console.log(`Done. Updated ${updated} player(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
