/**
 * Syncs canonical tables (players, player_seasons, player_season_stats) into frontend tables
 * player_info and player_stats so the existing API and website keep working.
 */
import { db, pool } from "../db";
import {
  canonicalPlayers,
  playerSeasons,
  playerSeasonStats,
  teams,
  leagues,
  seasons,
} from "@shared/canonicalSchema";
import { eq, sql } from "drizzle-orm";

export interface SyncResult {
  playersUpserted: number;
  statsDeleted: number;
  statsInserted: number;
  errors: string[];
}

/**
 * Sync all canonical data into player_info and player_stats.
 * Uses canonical players.id as player_info.id so one ID works across both.
 */
export async function syncFrontendTables(): Promise<SyncResult> {
  const result: SyncResult = { playersUpserted: 0, statsDeleted: 0, statsInserted: 0, errors: [] };

  try {
    const canonicalList = await db.select().from(canonicalPlayers);

    for (const p of canonicalList) {
      try {
        const [latestSeason] = await db
          .select({
            teamName: teams.name,
            jersey: playerSeasons.jersey,
            leagueName: leagues.name,
          })
          .from(playerSeasons)
          .innerJoin(teams, eq(teams.id, playerSeasons.teamId))
          .innerJoin(leagues, eq(leagues.id, playerSeasons.leagueId))
          .where(eq(playerSeasons.playerId, p.id))
          .orderBy(sql`${playerSeasons.id} DESC`)
          .limit(1);

        const teamName = latestSeason?.teamName ?? "—";
        const jersey = latestSeason?.jersey ?? 0;
        const weight = (p.weight ?? "—").toString().trim();
        const weightFormatted = weight && !/lb/i.test(weight) ? `${weight} lbs` : weight || "—";

        await pool.query(
          `INSERT INTO player_info (id, name, position, team, height, weight, jersey_number, headshot_url, bio, profile_views, hometown, birth_date, player_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $1)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             position = EXCLUDED.position,
             team = EXCLUDED.team,
             height = EXCLUDED.height,
             weight = EXCLUDED.weight,
             jersey_number = EXCLUDED.jersey_number,
             bio = EXCLUDED.bio,
             hometown = EXCLUDED.hometown,
             birth_date = EXCLUDED.birth_date,
             player_id = EXCLUDED.id`,
          [
            p.id,
            p.name,
            p.position ?? "G",
            teamName,
            p.height ?? "—",
            weightFormatted,
            jersey,
            "",
            null,
            50,
            null,
            p.birthDate ?? null,
          ]
        );
        result.playersUpserted++;
      } catch (err) {
        result.errors.push(`player ${p.id} ${p.name}: ${(err as Error).message}`);
      }
    }

    const canonicalIds = canonicalList.map((p) => p.id);
    if (canonicalIds.length > 0) {
      const del = await pool.query(
        `DELETE FROM player_stats WHERE player_id = ANY($1::int[])`,
        [canonicalIds]
      );
      result.statsDeleted = del.rowCount ?? 0;
    }

    const statsRows = await db
      .select({
        playerId: playerSeasons.playerId,
        seasonLabel: seasons.label,
        teamName: teams.name,
        leagueName: leagues.name,
        ptsPerG: playerSeasonStats.ptsPerG,
        trbPerG: playerSeasonStats.trbPerG,
        astPerG: playerSeasonStats.astPerG,
        stlPerG: playerSeasonStats.stlPerG,
        blkPerG: playerSeasonStats.blkPerG,
        fgPct: playerSeasonStats.fgPct,
        games: playerSeasons.games,
      })
      .from(playerSeasonStats)
      .innerJoin(playerSeasons, eq(playerSeasons.id, playerSeasonStats.playerSeasonId))
      .innerJoin(seasons, eq(seasons.id, playerSeasons.seasonId))
      .innerJoin(teams, eq(teams.id, playerSeasons.teamId))
      .innerJoin(leagues, eq(leagues.id, playerSeasons.leagueId));

    for (const row of statsRows) {
      try {
        const games = Number(row.games) || 0;
        await pool.query(
          `INSERT INTO player_stats (player_id, season, team, league, games_played, pts_per_g, trb_per_g, ast_per_g, stl_per_g, blk_per_g, fg_pct)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            row.playerId,
            row.seasonLabel,
            row.teamName,
            row.leagueName,
            games,
            String(row.ptsPerG ?? "0"),
            String(row.trbPerG ?? "0"),
            String(row.astPerG ?? "0"),
            String(row.stlPerG ?? "0"),
            String(row.blkPerG ?? "0"),
            String(row.fgPct ?? "0"),
          ]
        );
        result.statsInserted++;
      } catch (err) {
        result.errors.push(`stat player_id=${row.playerId} season=${row.seasonLabel}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    result.errors.push((err as Error).message);
  }

  return result;
}
