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

function formatWeight(weig: string | number): string {
  if (weig == null || weig === "") return "—";
  const w = String(weig).trim();
  if (w.endsWith(" lbs")) return w;
  return `${w} lbs`;
}

interface PlayerInfoRow {
  id: number;
  player_id: string;
  name: string;
  team: string;
  position: string;
  height: string;
  weig: string | number;
}

/** Shape the API returns for a player (matches frontend expectation). */
export interface PlayerInfoMapped {
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
}

function mapRowToPlayer(row: PlayerInfoRow): PlayerInfoMapped {
  return {
    id: row.id,
    name: (row.name || "").trim(),
    position: normalizePosition(row.position || ""),
    team: (row.team || "").trim(),
    height: formatHeight(row.height || ""),
    weight: formatWeight(row.weig),
    jerseyNumber: 0,
    headshotUrl: "",
    bio: null,
    profileViews: 50,
    hometown: null,
    birthDate: null,
  };
}

async function queryPlayerInfoTable(sql: string, params?: unknown[]): Promise<{ rows: PlayerInfoRow[] }> {
  try {
    const res = await pool.query<PlayerInfoRow>(sql, params ?? []);
    return { rows: res.rows || [] };
  } catch {
    return { rows: [] };
  }
}

/** Try "Player info" then "player_info"; return rows in API shape. */
export async function getPlayerInfoRows(): Promise<PlayerInfoMapped[]> {
  let out = await queryPlayerInfoTable(`SELECT * FROM "${PLAYER_INFO_TABLE_QUOTED}"`);
  if (out.rows.length === 0) {
    out = await queryPlayerInfoTable(`SELECT * FROM ${PLAYER_INFO_TABLE_SNAKE}`);
  }
  return out.rows.map(mapRowToPlayer);
}

/** Get a single row by id; try both table names. */
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
  return row ? mapRowToPlayer(row) : null;
}

export async function syncPlayerInfoFromPostgres(): Promise<{ created: number; updated: number; errors: string[] }> {
  const result = { created: 0, updated: 0, errors: [] as string[] };

  let rows: PlayerInfoRow[] = [];
  try {
    const res = await pool.query<PlayerInfoRow>(`SELECT id, player_id, name, team, position, height, weig FROM "${PLAYER_INFO_TABLE_QUOTED}"`);
    rows = res.rows || [];
  } catch {
    try {
      const res = await pool.query<PlayerInfoRow>(`SELECT id, player_id, name, team, position, height, weig FROM ${PLAYER_INFO_TABLE_SNAKE}`);
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
      const weight = formatWeight(row.weig);

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
