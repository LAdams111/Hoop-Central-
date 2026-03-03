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
const REQUEST_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.sports-reference.com/",
};
const REQUEST_DELAY_MS = 2800;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 8000;

/** End year for season: 2024 -> "2023-24". */
function endYearToSeason(endYear: number): string {
  const start = endYear - 1;
  const endStr = String(endYear).slice(-2);
  return `${start}-${endStr}`;
}

/** Fetch with retries on 429 (rate limit) or 5xx. Uses exponential backoff. */
async function fetchWithRetry(url: string): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (res.ok || res.status === 404) return res;
    if (res.status !== 429 && res.status < 500) return res;
    lastRes = res;
    if (attempt === MAX_RETRIES) return res;
    const waitMs =
      parseInt(res.headers.get("Retry-After") ?? "", 10) * 1000 ||
      RETRY_BACKOFF_MS * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return lastRes!;
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
 * Tries multiple strategies: id=per_game, stats_table class, then any table with player links + PTS header.
 */
function parsePerGameTable(html: string): NcaaPlayerRow[] {
  const out: NcaaPlayerRow[] = [];
  // Strategy 1: id="per_game"
  let tableMatch = html.match(/<table[^>]*id="per_game"[^>]*>[\s\S]*?<\/table>/i);
  // Strategy 2: class contains stats_table (first such table)
  if (!tableMatch) {
    const statsTable = html.match(/<table[^>]*class="[^"]*stats_table[^"]*"[^>]*>[\s\S]*?<\/table>/i);
    if (statsTable) tableMatch = statsTable;
  }
  // Strategy 3: any table that contains both player link and PTS in header (first such table)
  if (!tableMatch) {
    const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) || [];
    for (const t of tables) {
      if (/<a href="\/cbb\/players\//i.test(t) && /<th[^>]*>[\s\S]*?PTS[\s\S]*?<\/th>/i.test(t)) {
        tableMatch = [t];
        break;
      }
    }
  }
  if (!tableMatch) return out;

  const table = tableMatch[0];
  const rows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  let headerRow: string | null = null;
  const colIndex: Record<string, number> = {};

  // Try data-stat attributes first (sports-reference uses these)
  const firstDataRow = rows.find((r) => /data-stat="player"/i.test(r) && /<td/i.test(r));
  if (firstDataRow) {
    const headerRowForStat = rows.find((r) => /<th[^>]*data-stat="/i.test(r));
    if (headerRowForStat) {
      const statMatches = headerRowForStat.match(/<t[dh][^>]*data-stat="([^"]+)"[^>]*>/gi) || [];
      statMatches.forEach((tag, idx) => {
        const stat = (tag.match(/data-stat="([^"]+)"/i)?.[1] || "").toLowerCase();
        if (["g", "fg_pct", "trb", "ast", "stl", "blk", "pts", "pos"].includes(stat)) colIndex[stat] = idx;
      });
      if (Object.keys(colIndex).length >= 5) headerRow = headerRowForStat;
    }
    if (Object.keys(colIndex).length < 5) {
      colIndex["pos"] = 2;
      colIndex["g"] = 3;
      colIndex["fg_pct"] = 8;
      colIndex["trb"] = 21;
      colIndex["ast"] = 22;
      colIndex["stl"] = 23;
      colIndex["blk"] = 24;
      colIndex["pts"] = 27;
    }
  }

  if (!headerRow || Object.keys(colIndex).length < 5) {
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
  }

  if (!headerRow || Object.keys(colIndex).length < 5) {
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
    if (!tds || tds.length < 15) continue;

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

/**
 * Fetch one roster page and run the parser. Use for diagnostics (e.g. GET /api/ncaa/test-fetch).
 * Returns status, content length, whether we found a table, and how many player rows we parsed.
 */
export async function testFetchOnePage(
  slug: string = "duke",
  year: number = 2024
): Promise<{
  url: string;
  status: number;
  contentLength: number;
  hasPlayerLinks: boolean;
  hasPerGameTable: boolean;
  playerRowsFound: number;
  sampleNames: string[];
  error?: string;
}> {
  const url = `${BASE_URL}/cbb/schools/${slug}/men/${year}.html`;
  try {
    const res = await fetch(url, {
      headers: REQUEST_HEADERS,
    });
    const html = await res.text();
    const hasPlayerLinks = /<a href="\/cbb\/players\//i.test(html);
    const hasPerGameTable =
      /<table[^>]*id="per_game"/i.test(html) ||
      /<table[^>]*class="[^"]*stats_table[^"]*"/i.test(html) ||
      (hasPlayerLinks && /<th[^>]*>[\s\S]*?PTS[\s\S]*?<\/th>/i.test(html));
    const rows = parsePerGameTable(html);
    return {
      url,
      status: res.status,
      contentLength: html.length,
      hasPlayerLinks,
      hasPerGameTable,
      playerRowsFound: rows.length,
      sampleNames: rows.slice(0, 5).map((r) => r.name),
    };
  } catch (e) {
    return {
      url,
      status: 0,
      contentLength: 0,
      hasPlayerLinks: false,
      hasPerGameTable: false,
      playerRowsFound: 0,
      sampleNames: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
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
  /** Pages that returned HTTP 429 (rate limit) after retries */
  pages429?: number;
  /** Pages that returned 200 but parser found 0 player rows */
  pagesParseZero?: number;
}

let ncaaScraperRunning = false;
let lastNcaaScraperResult: NcaaScraperResult | null = null;
let lastNcaaScraperCompletedAt: Date | null = null;

export function isNcaaScraperRunning(): boolean {
  return ncaaScraperRunning;
}

/** Last run result and time, for status checks. */
export function getLastNcaaScraperResult(): { result: NcaaScraperResult; completedAt: Date } | null {
  if (!lastNcaaScraperResult || !lastNcaaScraperCompletedAt) return null;
  return { result: lastNcaaScraperResult, completedAt: lastNcaaScraperCompletedAt };
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
    pages429: 0,
    pagesParseZero: 0,
  };

  const playerCache = new Map<string, number>();

  try {
    for (const slug of schoolSlugs) {
      let schoolName: string | null = null;

      for (let year = startYear; year >= endYear; year--) {
        const season = endYearToSeason(year);
        const url = `${BASE_URL}/cbb/schools/${slug}/men/${year}.html`;

        try {
          const res = await fetchWithRetry(url);
          if (!res.ok) {
            if (res.status === 404) continue;
            if (res.status === 429) result.pages429!++;
            result.errors.push(`${slug}/${year}: HTTP ${res.status}`);
            continue;
          }

          const html = await res.text();
          if (!schoolName) schoolName = parseSchoolName(html, slug);

          const rows = parsePerGameTable(html);
          if (rows.length === 0) {
            result.pagesParseZero!++;
            continue;
          }

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
    lastNcaaScraperResult = result;
    lastNcaaScraperCompletedAt = new Date();
    console.log(
      `[NCAA scraper] Done: ${result.schoolsProcessed} roster pages, ${result.playersAdded} new players, ${result.playersMatched} matched, ${result.statsInserted} stats inserted, ${result.statsUpdated} updated. ` +
        (result.pages429 ? `429s: ${result.pages429}. ` : "") +
        (result.pagesParseZero ? `Parse-0 rows: ${result.pagesParseZero}. ` : "") +
        (result.errors.length ? `Errors: ${result.errors.length}` : "")
    );
  }

  return result;
}
