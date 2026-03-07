/**
 * One-time script: delete all players except Stephen Curry (id 1) and their related rows.
 * Run with: npx tsx server/scripts/clear-players-keep-curry.ts
 * Requires DATABASE_URL (or RAILWAY_POSTGRESQL_URL) in env — use Railway Postgres URL.
 */
import { pool } from "../db";

const KEEP_PLAYER_ID = 1;

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.RAILWAY_POSTGRESQL_URL;
  if (!connectionString) {
    console.error("Set DATABASE_URL or RAILWAY_POSTGRESQL_URL (e.g. from Railway Postgres variables).");
    process.exit(1);
  }

  console.log("Cleaning canonical tables: keep only player id =", KEEP_PLAYER_ID, "(Stephen Curry).");

  const client = await pool.connect();
  try {
    // 1. Delete player_season_stats for player_seasons that belong to other players
    const r1 = await client.query(
      `DELETE FROM player_season_stats
       WHERE player_season_id IN (SELECT id FROM player_seasons WHERE player_id != $1)`,
      [KEEP_PLAYER_ID]
    );
    console.log("  player_season_stats: deleted", r1.rowCount ?? 0, "rows");

    // 2. Delete player_seasons for other players
    const r2 = await client.query(`DELETE FROM player_seasons WHERE player_id != $1`, [KEEP_PLAYER_ID]);
    console.log("  player_seasons: deleted", r2.rowCount ?? 0, "rows");

    // 3. Delete player_external_ids for other players
    const r3 = await client.query(`DELETE FROM player_external_ids WHERE player_id != $1`, [KEEP_PLAYER_ID]);
    console.log("  player_external_ids: deleted", r3.rowCount ?? 0, "rows");

    // 4. Delete all players except Curry
    const r4 = await client.query(`DELETE FROM players WHERE id != $1`, [KEEP_PLAYER_ID]);
    console.log("  players: deleted", r4.rowCount ?? 0, "rows");
  } finally {
    client.release();
    await pool.end();
  }

  console.log("Done. Database now has only Stephen Curry (id 1).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
