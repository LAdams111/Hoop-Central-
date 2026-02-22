import type { Player } from "@shared/schema";
import { DEFAULT_HEADSHOT } from "@/lib/constants";

/**
 * Display-ready player from the Railway scraper. Same shape as Player but id
 * may be string (bbrefId) and we use bbrefId for profile links.
 */
export interface RailwayPlayerDisplay extends Omit<Player, "id"> {
  id: number | string;
  bbrefId: string;
}

function getStr(obj: unknown, ...keys: string[]): string {
  if (obj == null || typeof obj !== "object") return "";
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string") return v;
  }
  return "";
}

function getNum(obj: unknown, ...keys: string[]): number {
  if (obj == null || typeof obj !== "object") return 0;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

/**
 * Normalize a raw player object from the Railway scraper into the shape our UI
 * expects (Player-like). Handles both snake_case and camelCase.
 */
export function normalizeScraperPlayer(
  raw: unknown,
  index: number
): RailwayPlayerDisplay {
  if (raw == null || typeof raw !== "object") {
    return defaultPlayer("", index);
  }
  const o = raw as Record<string, unknown>;
  const bbrefId =
    getStr(o, "id", "bbrefId", "bbref_id", "player_id", "playerId") ||
    `player-${index}`;
  return {
    id: bbrefId,
    bbrefId,
    name: getStr(o, "name", "player_name", "playerName") || "Unknown",
    position: getStr(o, "position", "pos") || "—",
    team: getStr(o, "team", "team_name", "teamName") || "—",
    height: getStr(o, "height", "ht") || "—",
    weight: getStr(o, "weight", "wt", "weight_lbs") || "—",
    jerseyNumber: getNum(o, "jerseyNumber", "jersey_number", "number", "num", "jersey"),
    headshotUrl:
      getStr(o, "headshotUrl", "headshot_url", "image", "img", "photo") ||
      DEFAULT_HEADSHOT,
    bio: getStr(o, "bio", "description") || null,
    profileViews: getNum(o, "profileViews", "profile_views", "views") || 0,
    hometown: getStr(o, "hometown", "birth_place", "birthPlace") || null,
    birthDate: getStr(o, "birthDate", "birth_date", "dob", "birth_date_iso") || null,
  };
}

function defaultPlayer(bbrefId: string, index: number): RailwayPlayerDisplay {
  return {
    id: bbrefId || `player-${index}`,
    bbrefId: bbrefId || `player-${index}`,
    name: "Unknown",
    position: "—",
    team: "—",
    height: "—",
    weight: "—",
    jerseyNumber: 0,
    headshotUrl: DEFAULT_HEADSHOT,
    bio: null,
    profileViews: 0,
    hometown: null,
    birthDate: null,
  };
}

/**
 * Normalize scraper API list response into an array of RailwayPlayerDisplay.
 */
export function normalizeScraperPlayerList(rawList: unknown): RailwayPlayerDisplay[] {
  const list = Array.isArray(rawList) ? rawList : [];
  return list.map((raw, i) => normalizeScraperPlayer(raw, i));
}

/** Stat row for profile (season, team, ppg, rpg, apg, etc.) */
export interface RailwayStatRow {
  season?: string;
  team?: string;
  league?: string;
  gamesPlayed?: number;
  pointsPerGame?: string;
  reboundsPerGame?: string;
  assistsPerGame?: string;
  stealsPerGame?: string;
  blocksPerGame?: string;
  fieldGoalPct?: string;
}

/**
 * Normalized Railway player detail (single-player API response) for profile display.
 */
export interface RailwayPlayerDetail extends RailwayPlayerDisplay {
  stats?: RailwayStatRow[];
}

function normalizeStatRow(raw: unknown): RailwayStatRow {
  if (raw == null || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = o[k];
      if (v !== undefined && v !== null) return String(v);
    }
    return undefined;
  };
  const gp = getNum(o, "gamesPlayed", "games_played", "gp", "g");
  return {
    season: get("season", "year", "season_year"),
    team: get("team", "team_name", "teamName"),
    league: get("league", "lg"),
    gamesPlayed: gp > 0 ? gp : undefined,
    pointsPerGame: get("pointsPerGame", "ppg", "pts", "points_per_game"),
    reboundsPerGame: get("reboundsPerGame", "rpg", "reb", "rebounds_per_game"),
    assistsPerGame: get("assistsPerGame", "apg", "ast", "assists_per_game"),
    stealsPerGame: get("stealsPerGame", "spg", "stl", "steals_per_game"),
    blocksPerGame: get("blocksPerGame", "bpg", "blk", "blocks_per_game"),
    fieldGoalPct: get("fieldGoalPct", "fg_pct", "fg%", "fg_pct_pct"),
  };
}

/**
 * Normalize a single-player detail response from the Railway scraper for profile view.
 */
export function normalizeScraperPlayerDetail(raw: unknown): RailwayPlayerDetail {
  const base = normalizeScraperPlayer(raw, 0);
  if (raw == null || typeof raw !== "object") {
    return { ...base, stats: [] };
  }
  const o = raw as Record<string, unknown>;
  const statsRaw = o.stats ?? o.seasons ?? o.career_stats ?? o.seasonStats ?? o.career ?? [];
  const statsList = Array.isArray(statsRaw) ? statsRaw : [];
  const stats = statsList.map(normalizeStatRow).filter((s) => s.season || s.team || s.pointsPerGame);
  return { ...base, stats };
}
