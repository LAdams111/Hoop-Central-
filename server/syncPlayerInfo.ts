/**
 * Syncs from the Postgres "Player info" table (id, player_id, name, team, position, height, weig)
 * into the app's `players` table so Hoop Central can show player profiles.
 */
import { pool } from "./db";
import { storage } from "./storage";

const PLAYER_INFO_TABLE_QUOTED = "Player info"; // with space; use in SQL as "Player info"
const PLAYER_INFO_TABLE_SNAKE = "player_info";  // fallback if DB uses snake_case

function normalizePosition(position: string): string {
  const p = (position || "").toLowerCase();
  if (p.includes("point guard") || p === "pg") return "PG";
  if (p.includes("shooting guard") || p === "sg") return "SG";
  if (p.includes("small forward") || p === "sf") return "SF";
  if (p.includes("power forward") || p === "pf") return "PF";
  if (p.includes("center") || p === "c") return "C";
  return position || "—";
}

function formatHeight(height: string): string {
  if (!height || typeof height !== "string") return "—";
  const trimmed = height.trim();
  if (trimmed.includes("'")) return trimmed;
  const match = trimmed.match(/^(\d+)-(\d+)$/);
  if (match) return `${match[1]}'${match[2]}"`;
  return trimmed;
}

/** Return weight as number only (no "lbs") so frontend can add " lbs" once. */
function formatWeight(weig: string | number): string {
  if (weig == null || weig === "") return "—";
  let w = String(weig).trim();
  w = w.replace(/\s*lb(s)?\s*$/i, "").trim();
  return w || "—";
}

/** One stat row for profile (matches player_stats shape). */
export interface PlayerInfoStatRow {
  id: number;
  season: string;
  team: string;
  league: string;
  gamesPlayed: number;
  pointsPerGame: string;
  reboundsPerGame: string;
  assistsPerGame: string;
  stealsPerGame: string;
  blocksPerGame: string;
  fieldGoalPct: string;
}

interface PlayerInfoRow {
  id: number;
  player_id: string;
  name: string;
  team: string;
  position: string;
  height: string;
  weig?: string | number;
  weight?: string | number;
  stats?: string | Record<string, unknown>;
}

/** Shape the API returns for a player (matches frontend expectation). */
export interface PlayerInfoMapped {
  id: number;
  player_id: string;
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
  stats?: PlayerInfoStatRow[];
}

function getNum(o: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = o[k];
    if (v != null && v !== "") return Number(v);
  }
  return 0;
}
function getStr(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (v != null && v !== "") return String(v);
  }
  return "0";
}

/** Parse stats from JSON column (object with pts_per_g, trb_per_g, ast_per_g or camelCase). */
function parseStatsFromRow(row: PlayerInfoRow): PlayerInfoStatRow[] {
  const raw = row.stats;
  if (raw == null) return [];
  let o: Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return [];
    }
  } else if (typeof raw === "object" && raw !== null) {
    o = raw as Record<string, unknown>;
  } else {
    return [];
  }
  const ppg = getStr(o, "pts_per_g", "ppg", "pointsPerGame", "points_per_game");
  const rpg = getStr(o, "trb_per_g", "rpg", "reboundsPerGame", "rebounds_per_game");
  const apg = getStr(o, "ast_per_g", "apg", "assistsPerGame", "assists_per_game");
  const spg = getStr(o, "stl_per_g", "spg", "stealsPerGame", "steals_per_game");
  const bpg = getStr(o, "blk_per_g", "bpg", "blocksPerGame", "blocks_per_game");
  const fg = getStr(o, "fg_pct", "fg_pct", "fieldGoalPct", "field_goal_pct");
  const gp = getNum(o, "games_played", "gamesPlayed", "gp", "g");
  const team = getStr(o, "team", "team_name") || (row.team || "NBA");
  const season = getStr(o, "season", "year", "season_year") || "N/A";
  const league = getStr(o, "league", "lg") || "NBA";
  return [{
    id: 0,
    season,
    team,
    league,
    gamesPlayed: gp || 1,
    pointsPerGame: ppg || "0",
    reboundsPerGame: rpg || "0",
    assistsPerGame: apg || "0",
    stealsPerGame: spg || "0",
    blocksPerGame: bpg || "0",
    fieldGoalPct: fg || "0",
  }];
}

function mapRowToPlayer(row: PlayerInfoRow): PlayerInfoMapped {
  const stats = parseStatsFromRow(row);
  return {
    id: row.id,
    player_id: String(row.player_id || "").trim(),
    name: (row.name || "").trim(),
    position: normalizePosition(row.position || ""),
    team: (row.team || "").trim(),
    height: formatHeight(row.height || ""),
    weight: formatWeight(row.weig ?? row.weight),
    jerseyNumber: 0,
    headshotUrl: "",
    bio: null,
    profileViews: 50,
    hometown: null,
    birthDate: null,
    ...(stats.length > 0 ? { stats } : {}),
  };
}

/** Try "Player info", then player_info, then "player info" (lowercase); return rows in API shape. */
export async function getPlayerInfoRows(): Promise<PlayerInfoMapped[]> {
  const tables = [
    `"${PLAYER_INFO_TABLE_QUOTED}"`,
    PLAYER_INFO_TABLE_SNAKE,
    `"player info"`,
  ];
  for (const table of tables) {
    try {
      const res = await pool.query<PlayerInfoRow>(`SELECT * FROM ${table}`);
      return (res.rows || []).map(mapRowToPlayer);
    } catch {
      continue;
    }
  }
  return [];
}

/** Get a single row by numeric id; try both table names; include stats from player_stats table. */
export async function getPlayerInfoById(id: number): Promise<PlayerInfoMapped | null> {
  let res = await pool.query<PlayerInfoRow>(`SELECT * FROM "${PLAYER_INFO_TABLE_QUOTED}" WHERE id = $1`, [id]);
  let row = res.rows?.[0];
  if (!row) {
    try {
      res = await pool.query<PlayerInfoRow>(`SELECT * FROM ${PLAYER_INFO_TABLE_SNAKE} WHERE id = $1`, [id]);
      row = res.rows?.[0];
    } catch {
      // ignore
    }
  }
  if (!row) return null;
  const mapped = mapRowToPlayer(row);
  const playerIdStr = String(row.player_id || "").trim();
  if (playerIdStr) {
    const statsFromTable = await getPlayerStatsFromPlayerStatsTable(playerIdStr);
    if (statsFromTable.length > 0) return { ...mapped, stats: statsFromTable };
  }
  return mapped;
}

/** Query user's player_stats table (JOIN source); map to API stat shape. */
interface PlayerStatsTableRow {
  id?: number;
  player_id: string;
  season?: string;
  team?: string;
  league?: string;
  games?: number;
  games_started?: number;
  pts_per_g?: string | number;
  trb_per_g?: string | number;
  ast_per_g?: string | number;
  stl_per_g?: string | number;
  blk_per_g?: string | number;
  fg_pct?: string | number;
  fg3_pct?: string | number;
  ft_pct?: string | number;
}

function mapPlayerStatsRow(r: PlayerStatsTableRow, index: number): PlayerInfoStatRow {
  return {
    id: r.id ?? index,
    season: String(r.season ?? "N/A"),
    team: String(r.team ?? "NBA"),
    league: String(r.league ?? "NBA"),
    gamesPlayed: Number(r.games) || 0,
    pointsPerGame: String(r.pts_per_g ?? "0"),
    reboundsPerGame: String(r.trb_per_g ?? "0"),
    assistsPerGame: String(r.ast_per_g ?? "0"),
    stealsPerGame: String(r.stl_per_g ?? "0"),
    blocksPerGame: String(r.blk_per_g ?? "0"),
    fieldGoalPct: String(r.fg_pct ?? "0"),
  };
}

export async function getPlayerStatsFromPlayerStatsTable(playerId: string): Promise<PlayerInfoStatRow[]> {
  try {
    const res = await pool.query<PlayerStatsTableRow>(
      "SELECT * FROM player_stats WHERE player_id = $1 ORDER BY season DESC",
      [playerId]
    );
    return (res.rows || []).map((r, i) => mapPlayerStatsRow(r, i));
  } catch {
    return [];
  }
}

/** Get a single row by player_id (e.g. "abdelal01"); JOIN with player_stats so stats are included. */
export async function getPlayerInfoByPlayerId(playerId: string): Promise<PlayerInfoMapped | null> {
  const id = String(playerId || "").trim();
  if (!id) return null;
  const tables = [`"${PLAYER_INFO_TABLE_QUOTED}"`, PLAYER_INFO_TABLE_SNAKE, `"player info"`];
  for (const table of tables) {
    try {
      const res = await pool.query<PlayerInfoRow>(`SELECT * FROM ${table} WHERE player_id = $1`, [id]);
      const row = res.rows?.[0];
      if (row) {
        const mapped = mapRowToPlayer(row);
        const statsFromTable = await getPlayerStatsFromPlayerStatsTable(id);
        return { ...mapped, stats: statsFromTable.length > 0 ? statsFromTable : mapped.stats };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function syncPlayerInfoFromPostgres(): Promise<{ created: number; updated: number; errors: string[] }> {
  const result = { created: 0, updated: 0, errors: [] as string[] };

  let rows: PlayerInfoRow[] = [];
  try {
    const res = await pool.query<PlayerInfoRow>(`SELECT * FROM "${PLAYER_INFO_TABLE_QUOTED}"`);
    rows = res.rows || [];
  } catch {
    try {
      const res = await pool.query<PlayerInfoRow>(`SELECT * FROM ${PLAYER_INFO_TABLE_SNAKE}`);
      rows = res.rows || [];
    } catch (e) {
      result.errors.push(`Failed to read Player info table: ${(e as Error).message}`);
      return result;
    }
  }

  for (const row of rows) {
    try {
      const name = (row.name || "").trim();
      const team = (row.team || "").trim();
      if (!name || !team) {
        result.errors.push(`Row id=${row.id}: missing name or team`);
        continue;
      }

      const position = normalizePosition(row.position || "");
      const height = formatHeight(row.height || "");
      const weight = formatWeight(row.weig ?? row.weight);

      const existing = await storage.getPlayerByNameAndTeam(name, team);
      if (existing) {
        await storage.updatePlayer(existing.id, {
          name,
          position,
          team,
          height,
          weight,
        });
        result.updated++;
      } else {
        await storage.createPlayer({
          name,
          position,
          team,
          height,
          weight,
          jerseyNumber: 0,
          headshotUrl: "",
          profileViews: 50,
        });
        result.created++;
      }
    } catch (e) {
      result.errors.push(`Row id=${row.id}: ${(e as Error).message}`);
    }
  }

  return result;
}

/** Ingest: insert one row into user's player_stats table (scraper calls after inserting into "Player info"). */
export async function insertPlayerStatsRow(row: {
  player_id: string;
  season?: string;
  team?: string;
  league?: string;
  games?: number;
  games_started?: number;
  pts_per_g?: string | number;
  trb_per_g?: string | number;
  ast_per_g?: string | number;
  stl_per_g?: string | number;
  blk_per_g?: string | number;
  fg_pct?: string | number;
  fg3_pct?: string | number;
  ft_pct?: string | number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO player_stats (
      player_id, season, team, league, games, games_started,
      pts_per_g, trb_per_g, ast_per_g, stl_per_g, blk_per_g,
      fg_pct, fg3_pct, ft_pct
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      row.player_id,
      row.season ?? "N/A",
      row.team ?? "NBA",
      row.league ?? "NBA",
      row.games ?? 0,
      row.games_started ?? 0,
      String(row.pts_per_g ?? 0),
      String(row.trb_per_g ?? 0),
      String(row.ast_per_g ?? 0),
      String(row.stl_per_g ?? 0),
      String(row.blk_per_g ?? 0),
      String(row.fg_pct ?? 0),
      String(row.fg3_pct ?? 0),
      String(row.ft_pct ?? 0),
    ]
  );
}
