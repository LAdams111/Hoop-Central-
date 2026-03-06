/**
 * Read players and stats from canonical tables (players, player_seasons, player_season_stats, etc.)
 * and return the same shape the frontend expects (legacy player_info / player_stats API).
 */

import { db } from "./db";
import {
  players,
  playerSeasons,
  playerSeasonStats,
  teamSeasons,
  teams,
  seasons,
  leagues,
} from "@shared/canonicalSchema";
import { eq, and, desc, sql, ilike } from "drizzle-orm";

/** API shape for one player (matches legacy player_info + stats). */
export interface CanonicalPlayerForApi {
  id: number;
  name: string;
  position: string;
  team: string;
  height: string;
  weight: string;
  jerseyNumber: number;
  headshotUrl: string;
  bio: string | null;
  profileViews: number;
  hometown: string | null;
  birthDate: string | null;
  stats: CanonicalStatForApi[];
}

/** API shape for one stat row (matches legacy player_stats). */
export interface CanonicalStatForApi {
  season: string;
  team: string;
  league: string;
  games_played: number;
  pts_per_g: string;
  trb_per_g: string;
  ast_per_g: string;
  stl_per_g: string;
  blk_per_g: string;
  fg_pct: string;
}

function formatHeight(heightCm: number | null): string {
  if (heightCm == null) return "—";
  const totalInches = Math.round(heightCm / 2.54);
  const ft = Math.floor(totalInches / 12);
  const inch = totalInches % 12;
  return `${ft}'${inch}"`;
}

function formatWeight(weightKg: number | null): string {
  if (weightKg == null) return "—";
  const lbs = Math.round(weightKg / 0.453592);
  return `${lbs} lbs`;
}

function seasonLabel(yearStart: number, yearEnd: number): string {
  const endShort = String(yearEnd).slice(-2);
  return `${yearStart}-${endShort}`;
}

/** Get list of players from canonical tables for GET /api/players. */
export async function getCanonicalPlayersList(options: {
  search?: string;
  position?: string;
  sortBy?: "views" | "name";
}): Promise<CanonicalPlayerForApi[]> {
  const conditions = [];
  if (options.search?.trim()) {
    const term = `%${options.search.trim()}%`;
    conditions.push(ilike(players.fullName, term));
  }
  if (options.position?.trim()) {
    conditions.push(ilike(sql`COALESCE(${players.position}, '')`, `%${options.position.trim()}%`));
  }

  const rows = conditions.length > 0
    ? await db.select().from(players).where(and(...conditions)).orderBy(desc(players.id))
    : await db.select().from(players).orderBy(desc(players.id));

  const result: CanonicalPlayerForApi[] = [];
  for (const p of rows) {
    const { team, jerseyNumber, stats } = await getLatestTeamAndStats(p.id);
    result.push({
      id: p.id,
      name: p.fullName,
      position: p.position ?? "—",
      team,
      height: formatHeight(p.heightCm),
      weight: formatWeight(p.weightKg),
      jerseyNumber: jerseyNumber ?? 0,
      headshotUrl: "",
      bio: null,
      profileViews: 50,
      hometown: p.birthPlace ?? null,
      birthDate: p.birthDate != null ? String(p.birthDate) : null,
      stats,
    });
  }
  if (options.sortBy === "name") {
    result.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  }
  return result;
}

/** Get total player count. */
export async function getCanonicalPlayerCount(): Promise<number> {
  const [r] = await db.select({ count: sql<number>`count(*)::int` }).from(players);
  return r?.count ?? 0;
}

/** Get latest team name and jersey for a player; load all stats for API. */
async function getLatestTeamAndStats(
  playerId: number
): Promise<{ team: string; jerseyNumber: number | null; stats: CanonicalStatForApi[] }> {
  const psRows = await db
    .select({
      psId: playerSeasons.id,
      jerseyNumber: playerSeasons.jerseyNumber,
      gamesPlayed: playerSeasons.gamesPlayed,
      teamName: teams.name,
      leagueName: leagues.name,
      yearStart: seasons.yearStart,
      yearEnd: seasons.yearEnd,
    })
    .from(playerSeasons)
    .innerJoin(teamSeasons, eq(teamSeasons.id, playerSeasons.teamSeasonId))
    .innerJoin(teams, eq(teams.id, teamSeasons.teamId))
    .innerJoin(seasons, eq(seasons.id, teamSeasons.seasonId))
    .innerJoin(leagues, eq(leagues.id, seasons.leagueId))
    .where(eq(playerSeasons.playerId, playerId))
    .orderBy(desc(playerSeasons.id));

  const latestTeam = psRows[0]?.teamName ?? "—";
  const latestJersey = psRows[0]?.jerseyNumber ?? null;
  const stats: CanonicalStatForApi[] = [];

  for (const ps of psRows) {
    const [statRow] = await db
      .select()
      .from(playerSeasonStats)
      .where(eq(playerSeasonStats.playerSeasonId, ps.psId))
      .limit(1);
    const g = statRow?.games ?? ps.gamesPlayed ?? 0;
    const gamesPlayed = typeof g === "number" ? g : parseInt(String(g), 10) || 0;
    const div = gamesPlayed > 0 ? gamesPlayed : 1;
    const pts = statRow?.points ?? 0;
    const reb = statRow?.rebounds ?? 0;
    const ast = statRow?.assists ?? 0;
    const stl = statRow?.steals ?? 0;
    const blk = statRow?.blocks ?? 0;
    const pct = statRow?.fgPct != null ? Number(statRow.fgPct) : 0;
    stats.push({
      season: seasonLabel(ps.yearStart, ps.yearEnd),
      team: ps.teamName,
      league: ps.leagueName,
      games_played: gamesPlayed,
      pts_per_g: ((typeof pts === "number" ? pts : Number(pts)) / div).toFixed(1),
      trb_per_g: ((typeof reb === "number" ? reb : Number(reb)) / div).toFixed(1),
      ast_per_g: ((typeof ast === "number" ? ast : Number(ast)) / div).toFixed(1),
      stl_per_g: ((typeof stl === "number" ? stl : Number(stl)) / div).toFixed(1),
      blk_per_g: ((typeof blk === "number" ? blk : Number(blk)) / div).toFixed(1),
      fg_pct: (pct <= 1 ? pct * 100 : pct).toFixed(1),
    });
  }

  return { team: latestTeam, jerseyNumber: latestJersey, stats };
}

/** Get one player by numeric id for GET /api/players/:id. */
export async function getCanonicalPlayerById(id: number): Promise<CanonicalPlayerForApi | null> {
  const [p] = await db.select().from(players).where(eq(players.id, id)).limit(1);
  if (!p) return null;
  const { team, jerseyNumber, stats } = await getLatestTeamAndStats(p.id);
  return {
    id: p.id,
    name: p.fullName,
    position: p.position ?? "—",
    team,
    height: formatHeight(p.heightCm),
    weight: formatWeight(p.weightKg),
    jerseyNumber: jerseyNumber ?? 0,
    headshotUrl: "",
    bio: null,
    profileViews: 50,
    hometown: p.birthPlace ?? null,
    birthDate: p.birthDate != null ? String(p.birthDate) : null,
    stats,
  };
}

/** Get one player by sr_player_id (e.g. "jamesle01") for GET /api/players/:id when id is string. */
export async function getCanonicalPlayerBySrPlayerId(srPlayerId: string): Promise<CanonicalPlayerForApi | null> {
  const [p] = await db
    .select({ player: players })
    .from(players)
    .where(eq(players.srPlayerId, srPlayerId.trim()))
    .limit(1);
  if (!p?.player) return null;
  return getCanonicalPlayerById(p.player.id);
}

/** Get players by birth year (for birth-year page). Returns API-shaped list. */
export async function getCanonicalPlayersByBirthYear(year: number, limit: number): Promise<CanonicalPlayerForApi[]> {
  const startStr = `${year}-01-01`;
  const endStr = `${year}-12-31`;
  const rows = await db
    .select()
    .from(players)
    .where(and(
      sql`${players.birthDate} >= ${startStr}::date`,
      sql`${players.birthDate} <= ${endStr}::date`
    ))
    .orderBy(desc(players.id))
    .limit(limit);
  const result: CanonicalPlayerForApi[] = [];
  for (const p of rows) {
    const { team, jerseyNumber, stats } = await getLatestTeamAndStats(p.id);
    result.push({
      id: p.id,
      name: p.fullName,
      position: p.position ?? "—",
      team,
      height: formatHeight(p.heightCm),
      weight: formatWeight(p.weightKg),
      jerseyNumber: jerseyNumber ?? 0,
      headshotUrl: "",
      bio: null,
      profileViews: 50,
      hometown: p.birthPlace ?? null,
      birthDate: p.birthDate != null ? String(p.birthDate) : null,
      stats,
    });
  }
  return result;
}

/** Birth year counts for year grid. */
export async function getCanonicalBirthYearCounts(): Promise<Record<string, number>> {
  const rows = await db.select({ birthDate: players.birthDate }).from(players);
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (r.birthDate == null) continue;
    const y = String(r.birthDate).slice(0, 4);
    counts[y] = (counts[y] ?? 0) + 1;
  }
  return counts;
}

/** Prospects: under maxAge, limit count (by birth_date). */
export async function getCanonicalProspects(maxAge: number, limit: number): Promise<CanonicalPlayerForApi[]> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - maxAge);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(players)
    .where(sql`${players.birthDate} >= ${cutoffStr}::date`)
    .orderBy(desc(players.id))
    .limit(limit);
  const result: CanonicalPlayerForApi[] = [];
  for (const p of rows) {
    const { team, jerseyNumber, stats } = await getLatestTeamAndStats(p.id);
    result.push({
      id: p.id,
      name: p.fullName,
      position: p.position ?? "—",
      team,
      height: formatHeight(p.heightCm),
      weight: formatWeight(p.weightKg),
      jerseyNumber: jerseyNumber ?? 0,
      headshotUrl: "",
      bio: null,
      profileViews: 50,
      hometown: p.birthPlace ?? null,
      birthDate: p.birthDate != null ? String(p.birthDate) : null,
      stats,
    });
  }
  return result;
}
