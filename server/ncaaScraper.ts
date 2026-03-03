/**
 * NCAA men's basketball scraper: sports-reference.com/cbb school roster pages.
 * Fetches all NCAA teams (by school slug), then for each school and season
 * parses the Per Game roster table and upserts player_info + player_stats (league NCAA).
 * Existing players are matched by name (case-insensitive); new players get a row in player_info.
 * Sports Reference wraps roster tables in HTML comments; we strip comments then parse with cheerio.
 */

import * as cheerio from "cheerio";
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
const REQUEST_DELAY_MS = 6000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 15000;

/** Treat empty string, dash, whitespace as null; parse integer safely. Never use "" for INTEGER columns. */
function toIntOrNull(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const s = typeof val === "string" ? val.trim() : String(val).trim();
  if (s === "" || s === "-" || /^\s*$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Treat empty string, dash, whitespace as null; parse float safely. Never use "" for NUMERIC columns. */
function toFloatOrNull(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const s = typeof val === "string" ? val.trim() : String(val).trim();
  if (s === "" || s === "-" || /^\s*$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** End year for season: 2024 -> "2023-24". */
function endYearToSeason(endYear: number): string {
  const start = endYear - 1;
  const endStr = String(endYear).slice(-2);
  return `${start}-${endStr}`;
}

/** Build roster page URL. Only use slug/year.html (no /men/). */
function rosterPageUrl(slug: string, year: number): string {
  return `${BASE_URL}/cbb/schools/${slug}/${year}.html`;
}

/** Fetch a roster page. Single URL only (no /men/). Returns { rateLimited: true } on 429. */
async function fetchRosterPage(
  slug: string,
  year: number
): Promise<{ url: string; html: string } | { rateLimited: true } | null> {
  const url = rosterPageUrl(slug, year);
  console.log("[NCAA scraper] full URL:", url);
  const res = await fetchWithRetry(url);
  console.log("[NCAA scraper] fetch status:", res.status, "url:", url);
  if (res.status === 429) return { rateLimited: true };
  if (res.status === 404 || !res.ok) return null;
  let html: string;
  try {
    html = await res.text();
  } catch {
    return null;
  }
  const rows = parseRosterTable(html);
  if (rows.length > 0) return { url, html };
  return null;
}

/** Fetch with retries on 429 (rate limit) or 5xx. Uses exponential backoff. */
async function fetchWithRetry(url: string): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: REQUEST_HEADERS });
    } catch (err) {
      console.error("[NCAA scraper] fetch threw:", err instanceof Error ? err.message : String(err), url);
      throw err;
    }
    if (res.ok || res.status === 404) return res;
    if (res.status !== 429 && res.status < 500) return res;
    lastRes = res;
    if (attempt === MAX_RETRIES) return res;
    const waitMs =
      parseInt(res.headers.get("Retry-After") ?? "", 10) * 1000 ||
      RETRY_BACKOFF_MS * Math.pow(2, attempt);
    console.log("[NCAA scraper] rate limit or 5xx, retrying after", waitMs, "ms:", url, "status:", res.status);
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
 * Parse the roster table from a CBB season page. Sports Reference uses <table id="roster">.
 * After stripping HTML comments, select #roster tbody tr. Name from <th>, position and stats from <td>.
 */
function parseRosterTable(html: string): NcaaPlayerRow[] {
  const cleaned = html.replace(/<!--/g, "").replace(/-->/g, "");
  const $ = cheerio.load(cleaned);

  const $roster = $("#roster");
  const rosterExists = $roster.length > 0;
  console.log("[NCAA parser] #roster exists:", rosterExists);

  if (!$roster.length) {
    console.log("[NCAA parser] no #roster table found");
    return [];
  }

  const $rows = $("#roster tbody tr");
  const rowCount = $rows.length;
  console.log("[NCAA parser] rows found:", rowCount);

  const out: NcaaPlayerRow[] = [];
  $rows.each((_, el) => {
    const $row = $(el);
    // Skip header rows (e.g. <tr> with only <th> or "Player" header)
    const $th = $row.find("th");
    if (!$th.length) return;
    const nameRaw = $th.find('a[href*="/cbb/players/"]').text().trim() || $th.first().text().trim();
    if (!nameRaw || /player|team totals/i.test(nameRaw)) return;

    const name = nameRaw.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").trim();
    if (!name) return;

    const $tds = $row.find("td");
    const getTdByStat = (stat: string): string =>
      $row.find(`td[data-stat="${stat}"]`).text().replace(/,/g, "").trim();
    const getTdByIndex = (i: number): string =>
      $tds.eq(i).text().replace(/,/g, "").trim();

    const pos = (getTdByStat("pos") || getTdByIndex(2) || "G").trim().toUpperCase().slice(0, 5) || "G";
    const g = parseInt(getTdByStat("g") || getTdByIndex(3) || "0", 10) || 0;
    const pts = parseFloat(getTdByStat("pts") || getTdByStat("pts_per_g") || getTdByIndex(27) || "0") || 0;
    const trb = parseFloat(getTdByStat("trb") || getTdByStat("trb_per_g") || "0") || 0;
    const ast = parseFloat(getTdByStat("ast") || getTdByStat("ast_per_g") || "0") || 0;
    const stl = parseFloat(getTdByStat("stl") || getTdByStat("stl_per_g") || "0") || 0;
    const blk = parseFloat(getTdByStat("blk") || getTdByStat("blk_per_g") || "0") || 0;
    let fgPct = parseFloat(getTdByStat("fg_pct") || "0") || 0;
    if (fgPct > 1) fgPct /= 100;

    out.push({
      name,
      pos: pos || "G",
      g: g || 1,
      ppg: pts,
      rpg: trb,
      apg: ast,
      spg: stl,
      bpg: blk,
      fgPct,
    });
  });

  if (out.length > 0) {
    console.log("[NCAA parser] first player name found:", out[0].name);
  }
  console.log("[NCAA parser] rows found after parsing:", out.length);
  return out;
}

/** Per-game stats from #per_game table (same comment-stripped HTML as roster). Keyed by normalized name for merge. */
export interface PerGameStatsRow {
  g: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  fgPct: number;
}

/** Parse #per_game table into a map by player name (trimmed lowercase). Used to merge stats with roster before insert. */
function parsePerGameStats(html: string): Map<string, PerGameStatsRow> {
  const cleaned = html.replace(/<!--/g, "").replace(/-->/g, "");
  const $ = cheerio.load(cleaned);
  const stats = new Map<string, PerGameStatsRow>();

  const $rows = $("#per_game tbody tr");
  $rows.each((_, el) => {
    const $row = $(el);
    const nameRaw = $row.find('td[data-stat="player"] a').text().trim();
    if (!nameRaw || /team totals/i.test(nameRaw)) return;
    const name = nameRaw.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").trim();
    const nameKey = name.toLowerCase().trim();

    const g = toIntOrNull($row.find('td[data-stat="g"]').text()) ?? 0;
    const ppg = toFloatOrNull($row.find('td[data-stat="pts_per_g"]').text()) ?? toFloatOrNull($row.find('td[data-stat="pts"]').text()) ?? 0;
    const rpg = toFloatOrNull($row.find('td[data-stat="trb_per_g"]').text()) ?? toFloatOrNull($row.find('td[data-stat="trb"]').text()) ?? 0;
    const apg = toFloatOrNull($row.find('td[data-stat="ast_per_g"]').text()) ?? toFloatOrNull($row.find('td[data-stat="ast"]').text()) ?? 0;
    const spg = toFloatOrNull($row.find('td[data-stat="stl_per_g"]').text()) ?? toFloatOrNull($row.find('td[data-stat="stl"]').text()) ?? 0;
    const bpg = toFloatOrNull($row.find('td[data-stat="blk_per_g"]').text()) ?? toFloatOrNull($row.find('td[data-stat="blk"]').text()) ?? 0;
    let fgPct = toFloatOrNull($row.find('td[data-stat="fg_pct"]').text()) ?? 0;
    if (fgPct > 1) fgPct /= 100;

    stats.set(nameKey, { g, ppg, rpg, apg, spg, bpg, fgPct });
  });
  console.log("[NCAA parser] #per_game stats entries:", stats.size);
  return stats;
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
 */
export async function testFetchOnePage(
  slug: string = "duke",
  year: number = 2024
): Promise<{
  url: string;
  status: number;
  contentLength: number;
  hasRosterTable: boolean;
  playerRowsFound: number;
  sampleNames: string[];
  error?: string;
  rateLimited?: boolean;
}> {
  const url = rosterPageUrl(slug, year);
  console.log("[NCAA scraper] full URL:", url);
  try {
    const got = await fetchRosterPage(slug, year);
    if (got === null) {
      return {
        url,
        status: 200,
        contentLength: 0,
        hasRosterTable: false,
        playerRowsFound: 0,
        sampleNames: [],
        rateLimited: false,
      };
    }
    if ("rateLimited" in got) {
      return {
        url,
        status: 429,
        contentLength: 0,
        hasRosterTable: false,
        playerRowsFound: 0,
        sampleNames: [],
        rateLimited: true,
      };
    }
    const { url: usedUrl, html } = got;
    const hasRosterTable = /id="roster"/i.test(html.replace(/<!--/g, "").replace(/-->/g, ""));
    const rows = parseRosterTable(html);
    return {
      url: usedUrl,
      status: 200,
      contentLength: html.length,
      hasRosterTable,
      playerRowsFound: rows.length,
      sampleNames: rows.slice(0, 5).map((r) => r.name),
      rateLimited: false,
    };
  } catch (e) {
    return {
      url,
      status: 0,
      contentLength: 0,
      hasRosterTable: false,
      playerRowsFound: 0,
      sampleNames: [],
      error: e instanceof Error ? e.message : String(e),
      rateLimited: false,
    };
  }
}

export interface NcaaScraperOptions {
  schoolSlugs?: string[];
  startYear?: number;
  endYear?: number;
  delayMs?: number;
  /** If set, only process this many schools (for "light" runs to avoid 429). */
  maxSchools?: number;
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

  const currentYear = new Date().getFullYear();
  const latestSeason = currentYear; // Sports Reference CBB uses ending year (e.g. 2026.html = 2025-26 season)

  const {
    schoolSlugs = DEFAULT_SCHOOL_SLUGS,
    delayMs = REQUEST_DELAY_MS,
    maxSchools,
  } = options;

  // Last 4 seasons by default; never fetch a future year
  let startYear = options.startYear ?? latestSeason;
  let endYear = options.endYear ?? latestSeason - 3;
  if (startYear > currentYear) startYear = currentYear;

  const slugsToUse = maxSchools ? schoolSlugs.slice(0, maxSchools) : schoolSlugs;

  console.log("[NCAA scraper] starting: schools=" + slugsToUse.length + ", startYear=" + startYear + ", endYear=" + endYear);

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
    for (const slug of slugsToUse) {
      let schoolName: string | null = null;

      for (let year = startYear; year >= endYear; year--) {
        const season = endYearToSeason(year);
        console.log("[NCAA scraper] scraping season year:", year);

        try {
          const got = await fetchRosterPage(slug, year);
          if (got === null) {
            result.pagesParseZero!++;
            console.warn("[NCAA scraper] fetched zero players for", slug, year);
            continue;
          }
          if ("rateLimited" in got) {
            result.pages429!++;
            result.errors.push(`${slug}/${year}: HTTP 429`);
            console.warn("[NCAA scraper] rate limited:", slug, year);
            continue;
          }
          const { url, html } = got;

          if (!schoolName) schoolName = parseSchoolName(html, slug);

          let rows: NcaaPlayerRow[];
          try {
            rows = parseRosterTable(html);
          } catch (parseErr) {
            result.errors.push(`${slug}/${year}: parse error ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
            console.error("[NCAA scraper] parse error:", slug, year, parseErr);
            continue;
          }

          console.log("[NCAA scraper] parsed players:", rows.length, slug, year);
          if (rows.length === 0) {
            result.pagesParseZero!++;
            console.warn("[NCAA scraper] fetched zero players for", slug, year);
            continue;
          }

          const perGameStats = parsePerGameStats(html);

          let batchInserted = 0;
          let batchUpdated = 0;

          for (const row of rows) {
            try {
            const nameNorm = row.name.trim().toLowerCase();
            const playerStatsFromPerGame = perGameStats.get(nameNorm);

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

            /** Merge #per_game stats with roster row; default to 0 so we never send invalid values. */
            const g = playerStatsFromPerGame?.g ?? row.g;
            const ppgVal = playerStatsFromPerGame?.ppg ?? row.ppg;
            const rpgVal = playerStatsFromPerGame?.rpg ?? row.rpg;
            const apgVal = playerStatsFromPerGame?.apg ?? row.apg;
            const spgVal = playerStatsFromPerGame?.spg ?? row.spg;
            const bpgVal = playerStatsFromPerGame?.bpg ?? row.bpg;
            const fgVal = playerStatsFromPerGame?.fgPct ?? row.fgPct;
            const fgRaw = toFloatOrNull(fgVal) ?? 0;
            const statRow = {
              playerId,
              season: seasonDisplay,
              team: schoolName || slug,
              league: "NCAA" as const,
              gamesPlayed: toIntOrNull(g) ?? 0,
              pointsPerGame: (toFloatOrNull(ppgVal) ?? 0).toFixed(1),
              reboundsPerGame: (toFloatOrNull(rpgVal) ?? 0).toFixed(1),
              assistsPerGame: (toFloatOrNull(apgVal) ?? 0).toFixed(1),
              stealsPerGame: (toFloatOrNull(spgVal) ?? 0).toFixed(1),
              blocksPerGame: (toFloatOrNull(bpgVal) ?? 0).toFixed(1),
              fieldGoalPct: (fgRaw > 1 ? fgRaw : fgRaw * 100).toFixed(1),
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
              batchUpdated++;
            } else {
              await storage.createPlayerStats(statRow);
              result.statsInserted++;
              batchInserted++;
            }
            } catch (rowErr) {
              result.errors.push(`${slug}/${year} ${row.name}: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`);
              console.error("[NCAA scraper] insert/update failed for row:", row.name, slug, year, rowErr);
            }
          }

          if (batchInserted > 0 || batchUpdated > 0) {
            console.log("[NCAA scraper] batch done:", slug, year, "inserted:", batchInserted, "updated:", batchUpdated);
          }

          result.schoolsProcessed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(`${slug}/${year}: ${msg}`);
          console.error("[NCAA scraper] page error:", slug, year, err);
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

/** One player-season row for import (same shape as NBA stats in DB). */
export interface NcaaImportRow {
  name: string;
  school: string;
  season: string;
  g: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  fg_pct: number;
}

export interface NcaaImportResult {
  playersAdded: number;
  playersMatched: number;
  statsInserted: number;
  statsUpdated: number;
  errors: string[];
}

/** Import NCAA player-season stats (like NBA API flow). Call from POST /api/ncaa/import with JSON body. */
export async function importNcaaPlayerSeasons(rows: NcaaImportRow[]): Promise<NcaaImportResult> {
  const result: NcaaImportResult = { playersAdded: 0, playersMatched: 0, statsInserted: 0, statsUpdated: 0, errors: [] };
  const playerCache = new Map<string, number>();

  for (const row of rows) {
    try {
      const nameNorm = row.name.trim().toLowerCase();
      const school = (row.school || "").trim();
      const season = (row.season || "").trim();
      if (!nameNorm || !school || !season) {
        result.errors.push("Missing name, school, or season");
        continue;
      }

      let playerId = playerCache.get(nameNorm);
      if (!playerId) {
        const existing = await db.select().from(players).where(sql`LOWER(TRIM(${players.name})) = ${nameNorm}`).limit(1);
        if (existing.length > 0) {
          playerId = existing[0].id;
          result.playersMatched++;
        } else {
          const newPlayer = await storage.createPlayer({
            name: row.name.trim(),
            position: "G",
            team: school,
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

      const g = toIntOrNull(row.g) ?? 0;
      if (g === 0) continue;

      const existing = await db.select().from(playerStats).where(
        and(
          eq(playerStats.playerId, playerId),
          sql`CAST(${playerStats.season} AS text) = ${season}`,
          eq(playerStats.league, "NCAA"),
          sql`LOWER(${playerStats.team}) = ${school.toLowerCase()}`
        )
      ).limit(1);

      const fgRaw = toFloatOrNull(row.fg_pct) ?? 0;
      const statRow = {
        playerId,
        season,
        team: school,
        league: "NCAA",
        gamesPlayed: g,
        pointsPerGame: (toFloatOrNull(row.ppg) ?? 0).toFixed(1),
        reboundsPerGame: (toFloatOrNull(row.rpg) ?? 0).toFixed(1),
        assistsPerGame: (toFloatOrNull(row.apg) ?? 0).toFixed(1),
        stealsPerGame: (toFloatOrNull(row.spg) ?? 0).toFixed(1),
        blocksPerGame: (toFloatOrNull(row.bpg) ?? 0).toFixed(1),
        fieldGoalPct: (Number.isFinite(fgRaw) && fgRaw > 1 ? fgRaw : fgRaw * 100).toFixed(1),
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
    } catch (err) {
      result.errors.push(`${row.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/** Accept HTML from a roster page (e.g. from local script), parse and import. Same storage as NBA. Merges #per_game stats. */
export async function importNcaaRosterHtml(schoolSlug: string, year: number, html: string): Promise<NcaaImportResult> {
  const schoolName = parseSchoolName(html, schoolSlug) || schoolSlug;
  const season = endYearToSeason(year);
  const rows = parseRosterTable(html);
  const perGameStats = parsePerGameStats(html);
  const importRows: NcaaImportRow[] = rows.map((r) => {
    const per = perGameStats.get(r.name.trim().toLowerCase());
    return {
      name: r.name,
      school: schoolName,
      season,
      g: per?.g ?? r.g,
      ppg: per?.ppg ?? r.ppg,
      rpg: per?.rpg ?? r.rpg,
      apg: per?.apg ?? r.apg,
      spg: per?.spg ?? r.spg,
      bpg: per?.bpg ?? r.bpg,
      fg_pct: (per?.fgPct ?? r.fgPct) * 100,
    };
  });
  return importNcaaPlayerSeasons(importRows);
}
