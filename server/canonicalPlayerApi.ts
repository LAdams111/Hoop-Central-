/**
 * Read players and stats from canonical tables (players, player_seasons, player_season_stats, etc.)
 * and return the same shape the frontend expects (legacy player_info / player_stats API).
 */

import { db, pool } from "./db";
import { getTeamMatchCandidates } from "./storage";
import { findPlayerByExternalId } from "./services/playerService";
import {
  players,
  playerSeasons,
  playerSeasonStats,
  teamSeasons,
  teams,
  seasons,
  leagues,
} from "@shared/canonicalSchema";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";

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

/** API shape for one stat row (matches legacy player_stats). Frontend expects camelCase. */
export interface CanonicalStatForApi {
  id?: number;
  season: string;
  team: string;
  league: string;
  games_played: number;
  gamesPlayed: number;
  pts_per_g: string;
  pointsPerGame: string;
  trb_per_g: string;
  reboundsPerGame: string;
  ast_per_g: string;
  assistsPerGame: string;
  stl_per_g: string;
  stealsPerGame: string;
  blk_per_g: string;
  blocksPerGame: string;
  fg_pct: string;
  fieldGoalPct: string;
}

function formatHeight(heightCm: number | string | null | undefined): string {
  if (heightCm == null || heightCm === "") return "—";
  const n = typeof heightCm === "string" ? parseFloat(heightCm) : heightCm;
  if (Number.isNaN(n)) return "—";
  const totalInches = Math.round(n / 2.54);
  const ft = Math.floor(totalInches / 12);
  const inch = totalInches % 12;
  return `${ft}'${inch}"`;
}

function formatWeight(weightKg: number | string | null | undefined): string {
  if (weightKg == null || weightKg === "") return "—";
  const n = typeof weightKg === "string" ? parseFloat(weightKg) : weightKg;
  if (Number.isNaN(n)) return "—";
  const lbs = Math.round(n / 0.453592);
  return `${lbs} lbs`;
}

function seasonLabel(yearStart: number, yearEnd: number): string {
  const endShort = String(yearEnd).slice(-2);
  return `${yearStart}-${endShort}`;
}

/** Parse season string (e.g. "2025-26", "2025") into yearStart and yearEnd for canonical seasons table. */
function parseSeasonToYears(season: string): { yearStart: number; yearEnd: number }[] {
  const s = (season ?? "").trim();
  const out: { yearStart: number; yearEnd: number }[] = [];
  const rangeMatch = s.match(/^(\d{4})-(\d{2})$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const endShort = parseInt(rangeMatch[2], 10);
    const end = endShort >= 0 && endShort <= 99 ? (start + 1) : endShort;
    out.push({ yearStart: start, yearEnd: end });
  }
  if (/^\d{4}$/.test(s)) {
    const start = parseInt(s, 10);
    out.push({ yearStart: start, yearEnd: start + 1 });
  }
  return out.length ? out : [];
}

/** Roster for team + season from canonical tables (player_seasons + team_seasons + teams + seasons).
 * Uses same logic as profile: if a player's profile shows they played for this team in this season, they appear here. */
export async function getCanonicalRoster(
  team: string,
  season: string
): Promise<CanonicalPlayerForApi[]> {
  const candidates = getTeamMatchCandidates(team).map((c) => c.toLowerCase());
  if (candidates.length === 0) return [];
  const yearPairs = parseSeasonToYears(season);
  if (yearPairs.length === 0) return [];

  const teamCondition = or(
    ...candidates.map((c) => sql`LOWER(${teams.name}) = ${c}`),
    ...candidates.map((c) => sql`LOWER(COALESCE(${teams.abbreviation}, '')) = ${c}`)
  );
  if (!teamCondition) return [];

  const result: CanonicalPlayerForApi[] = [];
  const seen = new Set<number>();

  for (const { yearStart, yearEnd } of yearPairs) {
    const rows = await db
      .select({
        playerId: players.id,
        fullName: players.fullName,
        position: players.position,
        heightCm: players.heightCm,
        weightKg: players.weightKg,
        birthDate: players.birthDate,
        birthPlace: players.birthPlace,
        profileViews: players.profileViews,
        teamName: teams.name,
        jerseyNumber: playerSeasons.jerseyNumber,
      })
      .from(playerSeasons)
      .innerJoin(players, eq(players.id, playerSeasons.playerId))
      .innerJoin(teamSeasons, eq(teamSeasons.id, playerSeasons.teamSeasonId))
      .innerJoin(teams, eq(teams.id, teamSeasons.teamId))
      .innerJoin(seasons, eq(seasons.id, teamSeasons.seasonId))
      .where(
        and(
          teamCondition,
          eq(seasons.yearStart, yearStart),
          eq(seasons.yearEnd, yearEnd)
        )
      );

    for (const r of rows) {
      if (seen.has(r.playerId)) continue;
      seen.add(r.playerId);
      result.push({
        id: r.playerId,
        name: r.fullName,
        position: r.position ?? "—",
        team: r.teamName,
        height: formatHeight(r.heightCm),
        weight: formatWeight(r.weightKg),
        jerseyNumber: r.jerseyNumber ?? 0,
        headshotUrl: "",
        bio: null,
        profileViews: Number(r.profileViews) || 50,
        hometown: r.birthPlace != null ? String(r.birthPlace) : null,
        birthDate: r.birthDate != null ? String(r.birthDate) : null,
        stats: [],
      });
    }
  }

  return result;
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
      profileViews: Number(p.profileViews) || 50,
      hometown: p.birthPlace ?? null,
      birthDate: p.birthDate != null ? String(p.birthDate) : null,
      stats,
    });
  }
  if (options.sortBy === "name") {
    result.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  } else {
    result.sort((a, b) => (b.profileViews ?? 0) - (a.profileViews ?? 0));
  }
  return result;
}

/** Get total player count. */
export async function getCanonicalPlayerCount(): Promise<number> {
  const [r] = await db.select({ count: sql<number>`count(*)::int` }).from(players);
  return r?.count ?? 0;
}

/** Get latest team name and jersey for a player; load all stats for API.
 * Uses correct join path: players → player_seasons → team_seasons → seasons (season from s.year_start/s.year_end).
 * player_seasons has no season column; season comes from team_seasons → seasons.
 * No league filter — returns NBA, WNBA, and all other leagues.
 * Results ordered by season descending.
 * Fallback: if DB has legacy schema (player_seasons.team_id, player_seasons.season_id instead of team_season_id), use that path so stats still show. */
async function getLatestTeamAndStats(
  playerId: number
): Promise<{ team: string; jerseyNumber: number | null; stats: CanonicalStatForApi[] }> {
  try {
    const result = await getLatestTeamAndStatsViaTeamSeasons(playerId);
    if (result.stats.length > 0) return result;
  } catch {
    // primary query failed (e.g. column team_season_id or table team_seasons missing)
  }
  return getLatestTeamAndStatsViaTeamAndSeasonId(playerId);
}

/** Primary path: player_seasons.team_season_id → team_seasons → seasons (schema from Drizzle / schema.sql).
 * Uses LEFT JOIN for team_seasons, seasons, teams, leagues so WNBA (and any league) stats are never dropped — filter by player_id only. */
async function getLatestTeamAndStatsViaTeamSeasons(
  playerId: number
): Promise<{ team: string; jerseyNumber: number | null; stats: CanonicalStatForApi[] }> {
  const { rows } = await pool.query<{
    ps_id: number;
    jersey_number: number | null;
    games_played: number | null;
    team_name: string | null;
    league_name: string | null;
    year_start: number | null;
    year_end: number | null;
    stat_games: number | null;
    stat_points: number | null;
    stat_rebounds: number | null;
    stat_assists: number | null;
    stat_steals: number | null;
    stat_blocks: number | null;
    stat_fg_pct: string | null;
  }>(
    `SELECT
      ps.id AS ps_id,
      ps.jersey_number,
      ps.games_played,
      t.name AS team_name,
      l.name AS league_name,
      s.year_start,
      s.year_end,
      pss.games AS stat_games,
      pss.points AS stat_points,
      pss.rebounds AS stat_rebounds,
      pss.assists AS stat_assists,
      pss.steals AS stat_steals,
      pss.blocks AS stat_blocks,
      pss.fg_pct AS stat_fg_pct
    FROM players p
    JOIN player_seasons ps ON ps.player_id = p.id
    LEFT JOIN team_seasons ts ON ts.id = ps.team_season_id
    LEFT JOIN seasons s ON s.id = ts.season_id
    JOIN player_season_stats pss ON pss.player_season_id = ps.id
    LEFT JOIN teams t ON t.id = ts.team_id
    LEFT JOIN leagues l ON l.id = s.league_id
    WHERE p.id = $1
    ORDER BY s.year_start DESC NULLS LAST, s.year_end DESC NULLS LAST`,
    [playerId]
  );
  return buildTeamAndStatsFromRows(rows);
}

/** Fallback path: player_seasons.team_id + player_seasons.season_id (legacy migration / index bootstrap schema). No team_seasons table. */
async function getLatestTeamAndStatsViaTeamAndSeasonId(
  playerId: number
): Promise<{ team: string; jerseyNumber: number | null; stats: CanonicalStatForApi[] }> {
  try {
    const { rows } = await pool.query<{
      ps_id: number;
      jersey_number: number | null;
      games_played: number | null;
      team_name: string;
      league_name: string;
      year_start: number;
      year_end: number;
      stat_games: number | null;
      stat_points: number | null;
      stat_rebounds: number | null;
      stat_assists: number | null;
      stat_steals: number | null;
      stat_blocks: number | null;
      stat_fg_pct: string | null;
    }>(
      `SELECT
        ps.id AS ps_id,
        ps.jersey AS jersey_number,
        ps.games AS games_played,
        t.name AS team_name,
        l.name AS league_name,
        s.year_start,
        s.year_end,
        pss.games AS stat_games,
        pss.points AS stat_points,
        pss.rebounds AS stat_rebounds,
        pss.assists AS stat_assists,
        pss.steals AS stat_steals,
        pss.blocks AS stat_blocks,
        pss.fg_pct AS stat_fg_pct
      FROM players p
      JOIN player_seasons ps ON ps.player_id = p.id
      JOIN teams t ON t.id = ps.team_id
      JOIN seasons s ON s.id = ps.season_id
      JOIN player_season_stats pss ON pss.player_season_id = ps.id
      LEFT JOIN leagues l ON l.id = s.league_id
      WHERE p.id = $1
      ORDER BY s.year_start DESC, s.year_end DESC`,
      [playerId]
    );
    return buildTeamAndStatsFromRows(rows);
  } catch {
    return { team: "—", jerseyNumber: null, stats: [] };
  }
}

function buildTeamAndStatsFromRows(
  rows: {
    ps_id: number;
    jersey_number: number | null;
    games_played: number | null;
    team_name: string | null;
    league_name: string | null;
    year_start: number | null;
    year_end: number | null;
    stat_games: number | null;
    stat_points: number | null;
    stat_rebounds: number | null;
    stat_assists: number | null;
    stat_steals: number | null;
    stat_blocks: number | null;
    stat_fg_pct: string | null;
  }[]
): { team: string; jerseyNumber: number | null; stats: CanonicalStatForApi[] } {
  const latestTeam = rows[0]?.team_name ?? "—";
  const latestJersey = rows[0]?.jersey_number ?? null;
  const stats: CanonicalStatForApi[] = [];
  for (const r of rows) {
    if (r.ps_id == null) continue;
    const g = r.stat_games ?? r.games_played ?? 0;
    const gamesPlayed = typeof g === "number" ? g : parseInt(String(g), 10) || 0;
    const div = gamesPlayed > 0 ? gamesPlayed : 1;
    const pts = r.stat_points ?? 0;
    const reb = r.stat_rebounds ?? 0;
    const ast = r.stat_assists ?? 0;
    const stl = r.stat_steals ?? 0;
    const blk = r.stat_blocks ?? 0;
    const pct = r.stat_fg_pct != null ? Number(r.stat_fg_pct) : 0;
    const ptsPerG = (typeof pts === "number" ? pts : Number(pts)) / div;
    const trbPerG = (typeof reb === "number" ? reb : Number(reb)) / div;
    const astPerG = (typeof ast === "number" ? ast : Number(ast)) / div;
    const stlPerG = (typeof stl === "number" ? stl : Number(stl)) / div;
    const blkPerG = (typeof blk === "number" ? blk : Number(blk)) / div;
    const fgPctDisplay = pct <= 1 ? pct * 100 : pct;
    const seasonStr = (r.year_start != null && r.year_end != null) ? seasonLabel(r.year_start, r.year_end) : "—";
    stats.push({
      id: r.ps_id,
      season: seasonStr,
      team: r.team_name ?? "—",
      league: r.league_name ?? "—",
      games_played: gamesPlayed,
      gamesPlayed,
      pts_per_g: ptsPerG.toFixed(1),
      pointsPerGame: ptsPerG.toFixed(1),
      trb_per_g: trbPerG.toFixed(1),
      reboundsPerGame: trbPerG.toFixed(1),
      ast_per_g: astPerG.toFixed(1),
      assistsPerGame: astPerG.toFixed(1),
      stl_per_g: stlPerG.toFixed(1),
      stealsPerGame: stlPerG.toFixed(1),
      blk_per_g: blkPerG.toFixed(1),
      blocksPerGame: blkPerG.toFixed(1),
      fg_pct: fgPctDisplay.toFixed(1),
      fieldGoalPct: fgPctDisplay.toFixed(1),
    });
  }
  return { team: latestTeam, jerseyNumber: latestJersey, stats };
}

/** Get one player by numeric id for GET /api/players/:id. */
export async function getCanonicalPlayerById(id: number): Promise<CanonicalPlayerForApi | null> {
  const [p] = await db.select().from(players).where(eq(players.id, id)).limit(1);
  if (!p) return null;
  const raw = p as Record<string, unknown>;
  const birthDateVal = p.birthDate ?? raw.birth_date;
  const birthPlaceVal = p.birthPlace ?? raw.birth_place;
  const { team, jerseyNumber, stats } = await getLatestTeamAndStats(p.id);
  return {
    id: p.id,
    name: p.fullName,
    position: p.position ?? "—",
    team,
    height: formatHeight(p.heightCm ?? raw.height_cm),
    weight: formatWeight(p.weightKg ?? raw.weight_kg),
    jerseyNumber: jerseyNumber ?? 0,
    headshotUrl: "",
    bio: null,
    profileViews: Number(p.profileViews) || 50,
    hometown: birthPlaceVal != null ? String(birthPlaceVal) : null,
    birthDate: birthDateVal != null ? String(birthDateVal) : null,
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

/** Get one player by external_id (e.g. WNBA slug "clarkca02w") when URL id is string and sr_player_id didn't match. */
export async function getCanonicalPlayerByExternalId(source: string, externalId: string): Promise<CanonicalPlayerForApi | null> {
  const player = await findPlayerByExternalId(source, externalId);
  if (!player) return null;
  return getCanonicalPlayerById(player.id);
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
      profileViews: Number(p.profileViews) || 50,
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
      profileViews: Number(p.profileViews) || 50,
      hometown: p.birthPlace ?? null,
      birthDate: p.birthDate != null ? String(p.birthDate) : null,
      stats,
    });
  }
  return result;
}

/** Set profile_views for a player in the canonical players table (for admin PATCH /api/players/:id/profile-views). */
export async function setCanonicalPlayerProfileViews(playerId: number, profileViews: number): Promise<void> {
  const value = Math.max(0, Math.floor(Number(profileViews)));
  await db.update(players).set({ profileViews: value }).where(eq(players.id, playerId));
}

/** Increment profile_views by 1 in the canonical players table. Used by POST /api/players/:id/view (no player_info). */
export async function incrementCanonicalPlayerProfileViews(playerId: number): Promise<void> {
  await pool.query(
    "UPDATE players SET profile_views = COALESCE(profile_views, 0) + 1 WHERE id = $1",
    [playerId]
  );
}

/** Team count from canonical teams table only. Used by GET /api/teams/count (no player_stats). */
export async function getCanonicalTeamCount(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM teams");
  return parseInt(rows[0]?.count ?? "0", 10);
}

/** All teams with league name from canonical schema. Used by GET /api/teams/all (no player_stats). */
export async function getCanonicalTeamsAll(): Promise<{ id: number; name: string; city: string | null; abbreviation: string | null; league: string | null }[]> {
  const { rows } = await pool.query<{ id: number; name: string; city: string | null; abbreviation: string | null; league: string | null }>(
    `SELECT t.id, t.name, t.city, t.abbreviation, l.name AS league
     FROM teams t
     LEFT JOIN leagues l ON l.id = t.league_id
     ORDER BY t.name`
  );
  return rows ?? [];
}

/** Teams for a given league from canonical schema. Used by GET /api/leagues/:league/teams (no player_stats). */
export async function getCanonicalTeamsByLeague(leagueName: string): Promise<{ team: string; season: string | null }[]> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT t.name FROM teams t
     INNER JOIN leagues l ON l.id = t.league_id
     WHERE LOWER(TRIM(l.name)) = LOWER(TRIM($1))
     ORDER BY t.name`,
    [leagueName]
  );
  return (rows ?? []).map((r) => ({ team: r.name, season: null }));
}
