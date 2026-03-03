/**
 * NCAA men's basketball scraper: sports-reference.com/cbb school roster pages.
 * Fetches all NCAA teams (by school slug), then for each school and season
 * parses the Per Game roster table and upserts player_info + player_stats (league NCAA).
 * Existing players are matched by name (case-insensitive); new players get a row in player_info.
 */

import { db } from "./db";
import { storage } from "./storage";
import { players, playerStats } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const BASE_URL = "https://www.sports-reference.com";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const REQUEST_DELAY_MS = 1200;

/** End year for season: 2024 -> "2023-24". */
function endYearToSeason(endYear: number): string {
  const start = endYear - 1;
  const endStr = String(endYear).slice(-2);
  return `${start}-${endStr}`;
}

/** Default list of school slugs (men's D1). Expand or fetch from /cbb/schools/ if needed. */
const DEFAULT_SCHOOL_SLUGS: string[] = [
  "duke", "kentucky", "north-carolina", "kansas", "ucla", "villanova", "connecticut", "arizona",
  "michigan-state", "indiana", "ohio-state", "michigan", "purdue", "wisconsin", "maryland", "louisville",
  "syracuse", "florida", "florida-state", "miami-fl", "virginia", "virginia-tech", "north-carolina-state",
  "georgia-tech", "clemson", "boston-college", "pittsburgh", "notre-dame", "wake-forest",
  "alabama", "auburn", "arkansas", "tennessee", "lsu", "mississippi-state", "ole-miss", "georgia",
  "south-carolina", "texas-am", "missouri", "vanderbilt",
  "baylor", "texas", "kansas", "texas-tech", "oklahoma", "west-virginia", "iowa-state", "oklahoma-state",
  "kansas-state", "tcu",
  "gonzaga", "saint-marys-ca", "san-diego-state", "byu", "santa-clara", "san-francisco", "portland",
  "oregon", "oregon-state", "washington", "washington-state", "colorado", "utah", "arizona-state",
  "usc", "stanford", "california", "ucla",
  "houston", "memphis", "cincinnati", "tulane", "temple", "south-florida", "wichita-state",
  "xavier", "creighton", "georgetown", "marquette", "seton-hall", "providence", "st-johns-ny",
  "butler", "depaul",
  "illinois", "iowa", "minnesota", "nebraska", "northwestern", "penn-state", "rutgers",
  "st-bonaventure", "dayton", "saint-louis", "davidson", "vcu", "richmond", "george-mason",
  "utah-state", "nevada", "boise-state", "new-mexico", "wyoming", "fresno-state", "unlv",
  "vermont", "yale", "princeton", "harvard", "pennsylvania", "columbia", "brown", "dartmouth",
  "cornell", "belmont", "murray-state", "morehead-state", "eastern-kentucky", "austin-peay",
  "north-alabama", "lipscomb", "jacksonville-state", "eastern-illinois", "southeast-missouri-state",
  "tennessee-tech", "tennessee-state", "siu-edwardsville", "ut-martin",
];

export interface NcaaPlayerRow {
  name: string;
  pos: string;
  g: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  fgPct: number;
}

/**
 * Parse the first "Per Game" (season) stats table from a roster page HTML.
 * Skips "Team Totals" and conference-only table. Returns array of player rows.
 */
function parsePerGameTable(html: string): NcaaPlayerRow[] {
  const out: NcaaPlayerRow[] = [];
  // Find first table that looks like per-game player stats: has "PTS" and player links
  const tableMatch = html.match(/<table[^>]*id="per_game"[^>]*>[\s\S]*?<\/table>/i)
    || html.match(/<table[^>]*class="[^"]*stats_table[^"]*"[^>]*>[\s\S]*?<\/table>/i);
  if (!tableMatch) return out;

  const table = tableMatch[0];
  const rows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  let headerRow: string | null = null;
  const colIndex: Record<string, number> = {};

  for (const row of rows) {
    const thCells = row.match(/<th[^>]*>[\s\S]*?<\/th>/gi);
    if (thCells && thCells.length > 2) {
      headerRow = row;
      const cellTexts = thCells.map((c) => (c.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()));
      ["g", "fg_pct", "trb", "ast", "stl", "blk", "pts"].forEach((key) => {
        const i = cellTexts.findIndex((t) => t.toUpperCase() === key.toUpperCase() || (key === "g" && t === "G") || (key === "pts" && t === "PTS"));
        if (i >= 0) colIndex[key] = i;
      });
      const posI = cellTexts.findIndex((t) => /^pos$/i.test(t));
      if (posI >= 0) colIndex["pos"] = posI;
      break;
    }
  }

  if (!headerRow || Object.keys(colIndex).length < 5) {
    // Fallback: assume standard column order from SR (Rk, Player, Pos, G, GS, MP, FG, FGA, FG%, ..., TRB, AST, STL, BLK, TOV, PF, PTS)
    colIndex["pos"] = 2;
    colIndex["g"] = 3;
    colIndex["fg_pct"] = 8;
    colIndex["trb"] = 21;
    colIndex["ast"] = 22;
    colIndex["stl"] = 23;
    colIndex["blk"] = 24;
    colIndex["pts"] = 27;
  } else if (colIndex["pos"] === undefined) {
    colIndex["pos"] = 2;
  }

  for (const row of rows) {
    const linkMatch = row.match(/<a href="\/cbb\/players\/[^"]+"[^>]*>([^<]+)<\/a>/i);
    if (!linkMatch) continue;
    const name = linkMatch[1].replace(/&amp;/g, "&").replace(/&#x27;/g, "'").trim();
    if (/team totals/i.test(name)) continue;

    const tds = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi);
    if (!tds || tds.length < 20) continue;

    const getNum = (key: string): number => {
      const i = colIndex[key];
      if (i === undefined || i >= tds.length) return 0;
      const raw = tds[i].replace(/<[^>]+>/g, "").replace(/,/g, "").trim();
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : 0;
    };
    const g = Math.max(0, Math.round(getNum("g")));
    if (g === 0) continue;

    const ppg = getNum("pts");
    const rpg = getNum("trb");
    const apg = getNum("ast");
    const spg = getNum("stl");
    const bpg = getNum("blk");
    let fgPct = getNum("fg_pct");
    if (fgPct > 1) fgPct /= 100;

    const posIdx = colIndex["pos"];
    let pos = "G";
    if (posIdx !== undefined && posIdx < tds.length) {
      pos = tds[posIdx].replace(/<[^>]+>/g, "").trim().toUpperCase() || "G";
    }

    out.push({ name, pos, g, ppg, rpg, apg, spg, bpg, fgPct });
  }

  return out;
}

/** Extract school display name from roster page (e.g. "Duke Blue Devils"). */
function parseSchoolName(html: string, slug: string): string {
  const titleMatch = html.match(/<title>([^|]+)\s*\|/i);
  if (titleMatch) {
    const t = titleMatch[1].trim();
    const m = t.match(/\d{4}-\d{2}\s+(.+?)\s+Men's Roster/i);
    if (m) return m[1].trim();
  }
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface NcaaScraperOptions {
  schoolSlugs?: string[];
  startYear?: number;
  endYear?: number;
  delayMs?: number;
}

export interface NcaaScraperResult {
  schoolsProcessed: number;
  schoolsSkipped: number;
  playersAdded: number;
  playersMatched: number;
  statsInserted: number;
  statsUpdated: number;
  errors: string[];
}

let ncaaScraperRunning = false;
export function isNcaaScraperRunning(): boolean {
  return ncaaScraperRunning;
}

export async function runNcaaScraper(options: NcaaScraperOptions = {}): Promise<NcaaScraperResult> {
  if (ncaaScraperRunning) throw new Error("NCAA scraper is already running");
  ncaaScraperRunning = true;

  const {
    schoolSlugs = DEFAULT_SCHOOL_SLUGS,
    startYear = new Date().getFullYear() + 1,
    endYear = 1990,
    delayMs = REQUEST_DELAY_MS,
  } = options;

  const result: NcaaScraperResult = {
    schoolsProcessed: 0,
    schoolsSkipped: 0,
    playersAdded: 0,
    playersMatched: 0,
    statsInserted: 0,
    statsUpdated: 0,
    errors: [],
  };

  const playerCache = new Map<string, number>();

  try {
    for (const slug of schoolSlugs) {
      let schoolName: string | null = null;

      for (let year = startYear; year >= endYear; year--) {
        const season = endYearToSeason(year);
        const url = `${BASE_URL}/cbb/schools/${slug}/men/${year}.html`;

        try {
          const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
          });
          if (!res.ok) {
            if (res.status === 404) continue;
            result.errors.push(`${slug}/${year}: HTTP ${res.status}`);
            continue;
          }

          const html = await res.text();
          if (!schoolName) schoolName = parseSchoolName(html, slug);

          const rows = parsePerGameTable(html);
          if (rows.length === 0) continue;

          for (const row of rows) {
            const nameNorm = row.name.trim().toLowerCase();
            let playerId = playerCache.get(nameNorm);

            if (!playerId) {
              const existing = await db.select().from(players).where(sql`LOWER(TRIM(${players.name})) = ${nameNorm}`).limit(1);
              if (existing.length > 0) {
                playerId = existing[0].id;
                result.playersMatched++;
              } else {
                const posMap: Record<string, string> = {
                  G: "PG", "G-F": "SG", F: "SF", "F-G": "SF", "F-C": "PF", C: "C", "C-F": "PF",
                };
                const newPlayer = await storage.createPlayer({
                  name: row.name.trim(),
                  position: posMap[row.pos] || "G",
                  team: schoolName || slug,
                  height: "—",
                  weight: "—",
                  jerseyNumber: 0,
                  headshotUrl: "",
                });
                playerId = newPlayer.id;
                result.playersAdded++;
              }
              playerCache.set(nameNorm, playerId);
            }

            const seasonDisplay = season;
            const existing = await db.select().from(playerStats).where(
              and(
                eq(playerStats.playerId, playerId),
                sql`CAST(${playerStats.season} AS text) = ${seasonDisplay}`,
                eq(playerStats.league, "NCAA"),
                sql`LOWER(${playerStats.team}) = ${(schoolName || slug).toLowerCase()}`
              )
            ).limit(1);

            const statRow = {
              playerId,
              season: seasonDisplay,
              team: schoolName || slug,
              league: "NCAA",
              gamesPlayed: row.g,
              pointsPerGame: row.ppg.toFixed(1),
              reboundsPerGame: row.rpg.toFixed(1),
              assistsPerGame: row.apg.toFixed(1),
              stealsPerGame: row.spg.toFixed(1),
              blocksPerGame: row.bpg.toFixed(1),
              fieldGoalPct: (row.fgPct * 100).toFixed(1),
            };

            if (existing.length > 0) {
              await db.update(playerStats).set({
                gamesPlayed: statRow.gamesPlayed,
                pointsPerGame: statRow.pointsPerGame,
                reboundsPerGame: statRow.reboundsPerGame,
                assistsPerGame: statRow.assistsPerGame,
                stealsPerGame: statRow.stealsPerGame,
                blocksPerGame: statRow.blocksPerGame,
                fieldGoalPct: statRow.fieldGoalPct,
              }).where(eq(playerStats.id, existing[0].id));
              result.statsUpdated++;
            } else {
              await storage.createPlayerStats(statRow);
              result.statsInserted++;
            }
          }

          result.schoolsProcessed++;
        } catch (err) {
          result.errors.push(`${slug}/${year}: ${err instanceof Error ? err.message : String(err)}`);
        }

        await new Promise((r) => setTimeout(r, delayMs));
      }

      if (!schoolName) result.schoolsSkipped++;
    }
  } finally {
    ncaaScraperRunning = false;
  }

  return result;
}
