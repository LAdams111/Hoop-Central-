/**
 * Syncs from the Postgres "Player info" table (id, player_id, name, team, position, height, weig)
 * into the app's `player_info` table so Hoop Central can show player profiles.
 */
import { eq, and, sql } from "drizzle-orm";
import { pool, db } from "./db";
import { players, playerStats } from "@shared/schema";
import { storage, getTeamMatchCandidates } from "./storage";

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
  jersey_number?: number | string;
  jerseyNumber?: number | string;
  number?: number | string;
  jersey?: number | string;
  num?: number | string;
  stats?: string | Record<string, unknown>;
  birth_date?: string | null;
  birthDate?: string | null;
  hometown?: string | null;
  bio?: string | null;
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

/** Try many possible column names for jersey number, then scan row for any key that looks like jersey/no/number. */
function getJerseyFromRow(row: Record<string, unknown>): number {
  const explicit = getNum(
    row,
    "jersey_number",
    "jerseyNumber",
    "jersey number",
    "Jersey Number",
    "number",
    "num",
    "jersey",
    "no",
    "No",
    "numbr",
    "jersey_no",
    "player_number",
    "player_no",
    "uniform_number",
    "uniform_no",
    "jerseynumber"
  );
  if (explicit !== 0) return explicit;
  for (const [key, value] of Object.entries(row)) {
    if (value == null || value === "") continue;
    const k = key.toLowerCase();
    if ((k.includes("jersey") || k.includes("number") || k === "no" || k === "num" || k.includes("uniform")) && typeof value === "number" && !Number.isNaN(value)) return value;
    if ((k.includes("jersey") || k === "no" || k === "num") && typeof value === "string") {
      const n = parseInt(value, 10);
      if (!Number.isNaN(n)) return n;
    }
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

/** Get first non-empty string from row using any of the given keys (supports "birth date", "birth place", etc.). */
function getFromRow(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== "") {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return null;
}

/** Normalize date to YYYY-MM-DD for frontend, or null if missing/invalid. */
function normalizeBirthDate(val: unknown): string | null {
  if (val == null || val === "") return null;
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mapRowToPlayer(row: PlayerInfoRow): PlayerInfoMapped {
  const stats = parseStatsFromRow(row);
  const rowAny = row as Record<string, unknown>;
  const birthDate = normalizeBirthDate(
    getFromRow(rowAny, "birth_date", "birthDate", "birth date", "dob", "date_of_birth")
  );
  const hometown = getFromRow(rowAny, "hometown", "birth_place", "birth place", "birthplace", "birth_place_city") ?? null;
  const bio = getFromRow(rowAny, "bio", "biography") ?? null;
  const jerseyNumber = getJerseyFromRow(rowAny);
  let profileViews = 50;
  for (const k of ["profile_views", "profileViews", "views"]) {
    const v = rowAny[k];
    if (v != null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n) && n >= 0) {
        profileViews = n;
        break;
      }
    }
  }
  let headshotUrl = "";
  for (const k of ["headshot_url", "headshotUrl", "headshot url", "image", "img"]) {
    const v = rowAny[k];
    if (typeof v === "string" && v.trim()) {
      headshotUrl = v.trim();
      break;
    }
  }
  return {
    id: row.id,
    player_id: String(row.player_id || "").trim(),
    name: (row.name || "").trim(),
    position: normalizePosition(row.position || ""),
    team: (getFromRow(rowAny, "team", "Team", "team_name", "teamName") ?? "").trim() || "NBA",
    height: formatHeight(row.height || ""),
    weight: formatWeight(row.weig ?? row.weight),
    jerseyNumber,
    headshotUrl,
    bio,
    profileViews,
    hometown,
    birthDate,
    ...(stats.length > 0 ? { stats } : {}),
  };
}

/** Return total count of players (for "Active Players" stat). Uses same source as list. */
export async function getPlayerInfoCount(): Promise<number> {
  const tables = [`"${PLAYER_INFO_TABLE_QUOTED}"`, PLAYER_INFO_TABLE_SNAKE, `"player info"`];
  for (const table of tables) {
    try {
      const res = await pool.query<{ count: number | string }>(`SELECT COUNT(*)::int AS count FROM ${table}`);
      const raw = res.rows?.[0]?.count;
      const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "0"), 10);
      if (!Number.isNaN(n)) return n;
    } catch {
      continue;
    }
  }
  return 0;
}

/** Birth year -> player count from external "Player info" table (full site data for year grid). */
export async function getBirthYearCountsFromExternalTable(): Promise<Record<string, number>> {
  const rows = await getPlayerInfoRows();
  const counts: Record<string, number> = {};
  for (const p of rows) {
    const bd = p.birthDate ?? (p as Record<string, unknown>).birth_date ?? null;
    if (bd == null || bd === "") continue;
    const d = new Date(String(bd).trim());
    if (Number.isNaN(d.getTime())) continue;
    const year = String(d.getFullYear());
    counts[year] = (counts[year] ?? 0) + 1;
  }
  return counts;
}

/** Whole-year age (birthday-based): 20 only after 20th birthday. */
function wholeYearAge(birthDate: Date, today: Date): number {
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

/** Prospects (strictly under maxAge in whole years) from external "Player info" table. Sorted by profileViews, limit applied. */
export async function getProspectsFromExternalTable(maxAge: number, limit: number): Promise<PlayerInfoMapped[]> {
  const rows = await getPlayerInfoRows();
  const now = new Date();
  const filtered = rows.filter((p) => {
    const bd = p.birthDate ?? (p as Record<string, unknown>).birth_date ?? null;
    if (bd == null || bd === "") return false;
    const d = new Date(String(bd).trim());
    if (Number.isNaN(d.getTime())) return false;
    const age = wholeYearAge(d, now);
    return age < maxAge;
  });
  filtered.sort((a, b) => (b.profileViews ?? 0) - (a.profileViews ?? 0));
  return filtered.slice(0, limit);
}

/** Players by birth year from external "Player info" table (same source as directory). Limit applied. */
export async function getPlayersByBirthYearFromExternalTable(year: number, limit: number): Promise<PlayerInfoMapped[]> {
  const rows = await getPlayerInfoRows();
  const yearNum = Number(year);
  if (Number.isNaN(yearNum)) return [];
  const filtered = rows.filter((p) => {
    const bd = p.birthDate ?? (p as Record<string, unknown>).birth_date ?? null;
    if (bd == null || bd === "") return false;
    const d = new Date(String(bd).trim());
    return !Number.isNaN(d.getTime()) && d.getFullYear() === yearNum;
  });
  filtered.sort((a, b) => (b.profileViews ?? 0) - (a.profileViews ?? 0));
  return filtered.slice(0, limit);
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

/** Fallback roster when player_stats is empty: return players whose current team matches (from Player info / player_info). */
export async function getRosterByCurrentTeamFromPlayerInfo(team: string): Promise<PlayerInfoMapped[]> {
  const candidates = new Set(getTeamMatchCandidates(team).map((c) => c.toLowerCase()));
  const rows = await getPlayerInfoRows();
  const matched = rows.filter((p) => candidates.has((p.team || "").trim().toLowerCase()));
  console.log("[roster] fallback by current team — total rows:", rows.length, "candidates:", Array.from(candidates).slice(0, 8).join(", "), "matched:", matched.length);
  if (matched.length === 0 && rows.length > 0) {
    const sampleTeams = [...new Set(rows.map((p) => (p.team || "").trim()).filter(Boolean))].slice(0, 5);
    console.log("[roster] fallback: sample team values in DB:", sampleTeams.join(", "));
  }
  return matched;
}

/** Fetch multiple players by id from external table (same source as list). Tries both table names. */
export async function getPlayerInfoByIds(ids: number[]): Promise<PlayerInfoMapped[]> {
  if (ids.length === 0) return [];
  const tables = [
    `"${PLAYER_INFO_TABLE_QUOTED}"`,
    PLAYER_INFO_TABLE_SNAKE,
    `"player info"`,
  ];
  for (const table of tables) {
    try {
      const res = await pool.query<PlayerInfoRow>(
        `SELECT * FROM ${table} WHERE id = ANY($1::int[])`,
        [ids]
      );
      const rows = res.rows || [];
      const byId = new Map<number, PlayerInfoMapped>();
      for (const row of rows) {
        const mapped = mapRowToPlayer(row);
        byId.set(mapped.id, mapped);
      }
      return ids.map((id) => byId.get(id)).filter(Boolean) as PlayerInfoMapped[];
    } catch {
      continue;
    }
  }
  return [];
}

/** Build season filter variants. Integer year = starting year (2025 → "2025-26", "2025"). */
function getSeasonVariants(season: string): string[] {
  const seasonNorm = (season || "").trim();
  const variants: string[] = seasonNorm ? [seasonNorm] : [];
  if (/^\d{4}$/.test(seasonNorm)) {
    const y = parseInt(seasonNorm, 10);
    variants.push(`${y}-${String(y + 1).slice(-2)}`);
  }
  const rangeMatch = seasonNorm.match(/^(\d{4})-(\d{2})$/);
  if (rangeMatch) {
    const startYear = rangeMatch[1];
    if (!variants.includes(startYear)) variants.push(startYear);
  }
  return variants;
}

/** Roster using app tables only: players + playerStats (no teamRecords, no external tables). Season column may be integer or text in DB — always compare as text. */
export async function getRosterFromExternalTableViaJoin(team: string, season: string) {
  const teamLower = team.toLowerCase();
  const seasonVariants = getSeasonVariants(season);
  if (seasonVariants.length === 0) return [];

  const rows = await db
    .select({
      id: players.id,
      name: players.name,
      position: players.position,
      team: playerStats.team,
      height: players.height,
      weight: players.weight,
      jerseyNumber: players.jerseyNumber,
      headshotUrl: players.headshotUrl,
      bio: players.bio,
      profileViews: players.profileViews,
      birthDate: players.birthDate,
      hometown: players.hometown,
    })
    .from(playerStats)
    .innerJoin(players, eq(players.id, playerStats.playerId))
    .where(
      and(
        sql`LOWER(${playerStats.team}) = ${teamLower}`,
        sql`CAST(${playerStats.season} AS text) IN (${sql.join(seasonVariants.map((v) => sql`${v}`), sql`, `)})`
      )
    );

  const seen = new Set<number>();
  return rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

/** Roster for team + season: only players whose stats include this team and season (same source as profile). */
export async function getRosterFromExternalTable(team: string, season: string): Promise<PlayerInfoMapped[]> {
  const candidates = new Set(getTeamMatchCandidates(team));
  const seasonVariants = getSeasonVariants(season);
  const rows = await getPlayerInfoRows();
  const out: PlayerInfoMapped[] = [];
  for (const p of rows) {
    const stats = p.stats ?? (await getPlayerStatsFromPlayerStatsTable(p.player_id));
    const hasMatch = stats.some(
      (s) => candidates.has((s.team || "").toLowerCase()) && seasonVariants.includes((s.season || "").trim())
    );
    if (hasMatch) out.push(p);
  }
  return out;
}

/** Get a single row by numeric id; try both table names; include stats from player_stats table. Falls back to getPlayerInfoRows() so we use same source as list. */
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
  if (!row) {
    const allRows = await getPlayerInfoRows();
    const found = allRows.find((p) => Number(p.id) === id);
    if (found) {
      let result: PlayerInfoMapped = found;
      const statsFromTable = await getPlayerStatsFromPlayerStatsTable(found.id);
      if (statsFromTable.length > 0) result = { ...found, stats: statsFromTable };
      try {
        const existing = await storage.getPlayerByNameAndTeam(found.name, found.team);
        if (existing) result = { ...result, profileViews: existing.profileViews };
      } catch {
        // ignore
      }
      return result;
    }
    return null;
  }
  const mapped = mapRowToPlayer(row);
  const playerIdStr = String(row.player_id || "").trim();
  let result: PlayerInfoMapped = mapped;
  const statsFromTable = await getPlayerStatsFromPlayerStatsTable(row.id);
  if (statsFromTable.length > 0) result = { ...mapped, stats: statsFromTable };
  try {
    const existing = await storage.getPlayerByNameAndTeam(mapped.name, mapped.team);
    if (existing) result = { ...result, profileViews: existing.profileViews };
  } catch {
    // app table may be missing or have different schema; keep mapped profileViews
  }
  return result;
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

/** Query player_stats by numeric player_info.id (player_stats.player_id is integer FK to player_info.id). */
export async function getPlayerStatsFromPlayerStatsTable(playerIdOrNumericId: number | string): Promise<PlayerInfoStatRow[]> {
  const id = typeof playerIdOrNumericId === "number"
    ? playerIdOrNumericId
    : parseInt(String(playerIdOrNumericId).trim(), 10);
  if (Number.isNaN(id)) return [];
  try {
    const res = await pool.query<PlayerStatsTableRow>(
      "SELECT * FROM player_stats WHERE player_id = $1 ORDER BY season DESC",
      [id]
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
        const statsFromTable = await getPlayerStatsFromPlayerStatsTable(row.id);
        let result: PlayerInfoMapped = { ...mapped, stats: statsFromTable.length > 0 ? statsFromTable : mapped.stats };
        try {
          const existing = await storage.getPlayerByNameAndTeam(mapped.name, mapped.team);
          if (existing) result = { ...result, profileViews: existing.profileViews };
        } catch {
          // app table may be missing or have different schema
        }
        return result;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** Increment profile view count for a player by player_id (external "Player info" table). Falls back to app table by name+team if external has no profile_views. */
export async function incrementProfileViewsByPlayerId(playerId: string): Promise<void> {
  const id = String(playerId || "").trim();
  if (!id) return;
  const tables = [`"${PLAYER_INFO_TABLE_QUOTED}"`, PLAYER_INFO_TABLE_SNAKE, `"player info"`];
  for (const table of tables) {
    try {
      await pool.query(
        `UPDATE ${table} SET profile_views = COALESCE(profile_views, 50) + 1 WHERE player_id = $1`,
        [id]
      );
      return;
    } catch {
      continue;
    }
  }
  // Fallback: external table may not have profile_views or player_id; increment app row by name+team
  try {
    const player = await getPlayerInfoByPlayerId(id);
    if (player && player.name && player.team) {
      const existing = await storage.getPlayerByNameAndTeam(player.name, player.team);
      if (existing) await storage.incrementPlayerViews(existing.id);
    }
  } catch {
    // ignore
  }
}

/** Set profile_views for a player by numeric id in the external "Player info" table(s). Used when admin updates view count and the profile is served from external table. */
export async function setExternalProfileViewsById(id: number, profileViews: number): Promise<void> {
  const value = Math.max(0, Math.floor(Number(profileViews)));
  const tables = [`"${PLAYER_INFO_TABLE_QUOTED}"`, PLAYER_INFO_TABLE_SNAKE, `"player info"`];
  for (const table of tables) {
    try {
      const res = await pool.query(
        `UPDATE ${table} SET profile_views = $1 WHERE id = $2`,
        [value, id]
      );
      if (res.rowCount && res.rowCount > 0) return;
    } catch {
      continue;
    }
  }
}

/** Increment profile_views by 1 for a player by numeric id in the external table(s). So view counts stay in sync when profile is served from external table. */
export async function incrementExternalProfileViewsById(id: number): Promise<void> {
  const tables = [`"${PLAYER_INFO_TABLE_QUOTED}"`, PLAYER_INFO_TABLE_SNAKE, `"player info"`];
  for (const table of tables) {
    try {
      await pool.query(
        `UPDATE ${table} SET profile_views = COALESCE(profile_views, 50) + 1 WHERE id = $1`,
        [id]
      );
      return;
    } catch {
      continue;
    }
  }
}

/** Set headshot URL for a player by numeric id in the external table(s). Tries common column names. */
export async function setExternalHeadshotById(id: number, headshotUrl: string): Promise<void> {
  const url = String(headshotUrl || "").trim();
  if (!url) return;
  const tables = [`"${PLAYER_INFO_TABLE_QUOTED}"`, PLAYER_INFO_TABLE_SNAKE, `"player info"`];
  for (const table of tables) {
    for (const col of ["headshot_url", "headshoturl"]) {
      try {
        const res = await pool.query(`UPDATE ${table} SET ${col} = $1 WHERE id = $2`, [url, id]);
        if (res.rowCount && res.rowCount > 0) return;
      } catch {
        continue;
      }
    }
  }
}

type ExternalPlayerUpdateData = Partial<{
  name: string;
  position: string;
  team: string;
  height: string;
  weight: string;
  jerseyNumber: number;
  bio: string | null;
  hometown: string | null;
  birthDate: string | null;
}>;

/** Build SET clause and values for external player update; useWeig = use "weig" column for weight. */
function buildExternalPlayerUpdate(data: ExternalPlayerUpdateData, useWeig: boolean) {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (data.name !== undefined) {
    updates.push(`name = $${idx++}`);
    values.push(data.name);
  }
  if (data.position !== undefined) {
    updates.push(`position = $${idx++}`);
    values.push(data.position);
  }
  if (data.team !== undefined) {
    updates.push(`team = $${idx++}`);
    values.push(data.team);
  }
  if (data.height !== undefined) {
    updates.push(`height = $${idx++}`);
    values.push(data.height);
  }
  if (data.weight !== undefined) {
    updates.push(`${useWeig ? "weig" : "weight"} = $${idx++}`);
    values.push(data.weight);
  }
  if (data.jerseyNumber !== undefined) {
    updates.push(`jersey_number = $${idx++}`);
    values.push(data.jerseyNumber);
  }
  if (data.bio !== undefined) {
    updates.push(`bio = $${idx++}`);
    values.push(data.bio);
  }
  if (data.hometown !== undefined) {
    updates.push(`hometown = $${idx++}`);
    values.push(data.hometown);
  }
  if (data.birthDate !== undefined) {
    updates.push(`birth_date = $${idx++}`);
    values.push(data.birthDate);
  }
  return { updates, values, nextIdx: idx };
}

/** Update a player in the external "Player info" table by numeric id (same as profile_views). Use this when you have the row id. */
export async function updateExternalPlayerById(
  id: number,
  data: ExternalPlayerUpdateData
): Promise<{ ok: boolean; error?: string }> {
  if (Object.keys(data).length === 0) return { ok: false, error: "No data" };
  const tables = [`"${PLAYER_INFO_TABLE_QUOTED}"`, PLAYER_INFO_TABLE_SNAKE, `"player info"`];
  let lastError: string | undefined;
  for (const table of tables) {
    const useWeig = table.includes(PLAYER_INFO_TABLE_QUOTED) || table === `"player info"`;
    const { updates, values, nextIdx } = buildExternalPlayerUpdate(data, useWeig);
    if (updates.length === 0) continue;
    values.push(id);
    const setClause = updates.join(", ");
    const whereClause = ` WHERE id = $${nextIdx}`;
    try {
      const res = await pool.query(
        `UPDATE ${table} SET ${setClause}${whereClause}`,
        values
      );
      if (res.rowCount != null && res.rowCount > 0) return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      continue;
    }
  }
  return { ok: false, error: lastError };
}

/** Update a player in the external "Player info" table by player_id (e.g. "jamesle01"). Used when PATCH /api/players/:id receives a string id. */
export async function updateExternalPlayerByPlayerId(
  playerId: string,
  data: ExternalPlayerUpdateData
): Promise<{ ok: boolean; error?: string }> {
  const id = String(playerId || "").trim();
  if (!id || Object.keys(data).length === 0) return { ok: false, error: "No data" };
  const tables = [`"${PLAYER_INFO_TABLE_QUOTED}"`, PLAYER_INFO_TABLE_SNAKE, `"player info"`];
  let lastError: string | undefined;
  for (const table of tables) {
    const useWeig = table.includes(PLAYER_INFO_TABLE_QUOTED) || table === `"player info"`;
    const { updates, values, nextIdx } = buildExternalPlayerUpdate(data, useWeig);
    if (updates.length === 0) continue;
    values.push(id);
    const setClause = updates.join(", ");
    for (const whereCol of ["player_id", `"Player ID"`]) {
      const whereClause = ` WHERE ${whereCol} = $${nextIdx}`;
      try {
        const res = await pool.query(
          `UPDATE ${table} SET ${setClause}${whereClause}`,
          values
        );
        if (res.rowCount != null && res.rowCount > 0) return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;
        continue;
      }
    }
  }
  return { ok: false, error: lastError };
}

/** Get profile_views for a player by numeric id from the external table(s). Used so GET /api/players/:id returns the updated count after admin sets it (external table may be the one we wrote). */
export async function getExternalProfileViewsById(id: number): Promise<number | null> {
  const tables = [`"${PLAYER_INFO_TABLE_QUOTED}"`, PLAYER_INFO_TABLE_SNAKE, `"player info"`];
  for (const table of tables) {
    try {
      const res = await pool.query<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = $1 LIMIT 1`, [id]);
      const row = res.rows?.[0] as Record<string, unknown> | undefined;
      if (!row) continue;
      const v = row.profile_views ?? row.profileViews ?? row["profile views"];
      if (v == null) continue;
      const n = typeof v === "number" ? v : parseInt(String(v), 10);
      if (!Number.isNaN(n) && n >= 0) return n;
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
      const rowAny = row as Record<string, unknown>;
      const birthDate = normalizeBirthDate(
        getFromRow(rowAny, "birth_date", "birthDate", "birth date", "dob", "date_of_birth")
      );
      const hometown = getFromRow(rowAny, "hometown", "birth_place", "birth place", "birthplace", "birth_place_city") ?? undefined;
      const bio = getFromRow(rowAny, "bio", "biography") ?? undefined;
      const jerseyNumber = getJerseyFromRow(rowAny);

      const existing = await storage.getPlayerByNameAndTeam(name, team);
      if (existing) {
        await storage.updatePlayer(existing.id, {
          name,
          position,
          team,
          height,
          weight,
          jerseyNumber,
          ...(birthDate != null && { birthDate }),
          ...(hometown != null && { hometown }),
          ...(bio != null && { bio }),
        });
        result.updated++;
      } else {
        await storage.createPlayer({
          name,
          position,
          team,
          height,
          weight,
          jerseyNumber,
          headshotUrl: "",
          profileViews: 50,
          ...(birthDate != null && { birthDate }),
          ...(hometown != null && { hometown }),
          ...(bio != null && { bio }),
        });
        result.created++;
      }
    } catch (e) {
      result.errors.push(`Row id=${row.id}: ${(e as Error).message}`);
    }
  }

  return result;
}

/** Ingest: insert one row into "Player info" (same table scraper uses). */
export async function insertIntoPlayerInfo(row: {
  player_id: string;
  name: string;
  team?: string;
  position?: string;
  height?: string;
  weight?: string | number;
  jersey_number?: number;
  jerseyNumber?: number;
  number?: number;
}): Promise<void> {
  const tables = [`"${PLAYER_INFO_TABLE_QUOTED}"`, PLAYER_INFO_TABLE_SNAKE];
  const name = (row.name || "").trim();
  const team = (row.team || "").trim();
  const position = normalizePosition(row.position || "");
  const height = formatHeight(row.height || "");
  const weight = formatWeight(row.weight ?? "—");
  const jersey = row.jersey_number ?? row.jerseyNumber ?? row.number ?? 0;
  for (const table of tables) {
    try {
      await pool.query(
        `INSERT INTO ${table} (player_id, name, team, position, height, weig, jersey_number) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.player_id, name, team, position, height, weight, jersey]
      );
      return;
    } catch {
      try {
        await pool.query(
          `INSERT INTO ${table} (player_id, name, team, position, height, weig) VALUES ($1, $2, $3, $4, $5, $6)`,
          [row.player_id, name, team, position, height, weight]
        );
        return;
      } catch {
        continue;
      }
    }
  }
  throw new Error("Could not insert into Player info (tried both table names)");
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
