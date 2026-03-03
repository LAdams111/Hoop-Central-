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
 * Parse the first "Per Game" (season) stats table from a roster page HTML.
 * Sports Reference CBB wraps tables in HTML comments; we remove comments then parse with cheerio.
 * CBB roster per-game table id is "per_game". Skips "Team Totals" row.
 */
function parsePerGameTable(html: string): NcaaPlayerRow[] {
  const cleaned = html.replace(/<!--/g, "").replace(/-->/g, "");
  const $ = cheerio.load(cleaned);

  // CBB roster per-game table: wrapper div#per_game or table#per_game on sports-reference.com/cbb
  let $table = $("#per_game table");
  if (!$table.length) $table = $('table#per_game');
  if (!$table.length) $table = $("table.stats_table").first();
  if (!$table.length) {
    console.log("[NCAA parser] no roster table found (#per_game or .stats_table)");
    return [];
  }

  const out: NcaaPlayerRow[] = [];
  const $rows = $table.find("tbody tr");
  $rows.each((_, el) => {
    const $row = $(el);
    const $playerCell = $row.find('td[data-stat="player"]');
    if (!$playerCell.length) return;

    const nameRaw = $playerCell.find('a[href*="/cbb/players/"]').text().trim();
    if (!nameRaw || /team totals/i.test(nameRaw)) return;

    const name = nameRaw.replace(/&amp;/g, "&").replace(/&#x27;/g, "'");

    const g = parseInt($row.find('td[data-stat="g"]').text().replace(/,/g, "").trim(), 10) || 0;
    if (g === 0) return;

    const getNum = (stat: string): number => {
      const text = $row.find(`td[data-stat="${stat}"]`).text().replace(/,/g, "").trim();
      const n = parseFloat(text);
      return Number.isFinite(n) ? n : 0;
    };
    const pts = getNum("pts") || getNum("pts_per_g");
    const trb = getNum("trb") || getNum("trb_per_g");
    const ast = getNum("ast") || getNum("ast_per_g");
    const stl = getNum("stl") || getNum("stl_per_g");
    const blk = getNum("blk") || getNum("blk_per_g");
    let fgPct = getNum("fg_pct");
    if (fgPct > 1) fgPct /= 100;

    const pos = ($row.find('td[data-stat="pos"]').text().trim().toUpperCase() || "G").slice(0, 5);

    out.push({
      name,
      pos: pos || "G",
      g,
      ppg: pts,
      rpg: trb,
      apg: ast,
      spg: stl,
      bpg: blk,
      fgPct,
    });
  });

  console.log("[NCAA parser] rows found after parsing:", out.length);
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
  rateLimited?: boolean;
}> {
  const url = `${BASE_URL}/cbb/schools/${slug}/men/${year}.html`;
  try {
    const res = await fetchWithRetry(url);
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
      rateLimited: res.status === 429,
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

  const {
    schoolSlugs = DEFAULT_SCHOOL_SLUGS,
    startYear = new Date().getFullYear() + 1,
    endYear = 1990,
    delayMs = REQUEST_DELAY_MS,
    maxSchools,
  } = options;

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
        const url = `${BASE_URL}/cbb/schools/${slug}/men/${year}.html`;

        try {
          const res = await fetchWithRetry(url);
          console.log("[NCAA scraper] fetch status:", res.status, "url:", url);

          if (!res.ok) {
            if (res.status === 404) {
              continue;
            }
            if (res.status === 429) result.pages429!++;
            result.errors.push(`${slug}/${year}: HTTP ${res.status}`);
            console.warn("[NCAA scraper] non-ok response:", res.status, slug, year);
            continue;
          }

          let html: string;
          try {
            html = await res.text();
          } catch (err) {
            result.errors.push(`${slug}/${year}: failed to read body ${err instanceof Error ? err.message : String(err)}`);
            console.error("[NCAA scraper] failed to read response body:", slug, year, err);
            continue;
          }

          if (!schoolName) schoolName = parseSchoolName(html, slug);

          let rows: NcaaPlayerRow[];
          try {
            rows = parsePerGameTable(html);
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

          let batchInserted = 0;
          let batchUpdated = 0;

          for (const row of rows) {
            try {
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

            /** Explicit league = 'NCAA' for every insert/update. */
            const statRow = {
              playerId,
              season: seasonDisplay,
              team: schoolName || slug,
              league: "NCAA" as const,
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

      const g = Math.max(0, Math.round(Number(row.g) || 0));
      if (g === 0) continue;

      const existing = await db.select().from(playerStats).where(
        and(
          eq(playerStats.playerId, playerId),
          sql`CAST(${playerStats.season} AS text) = ${season}`,
          eq(playerStats.league, "NCAA"),
          sql`LOWER(${playerStats.team}) = ${school.toLowerCase()}`
        )
      ).limit(1);

      const fgPct = Number(row.fg_pct);
      const statRow = {
        playerId,
        season,
        team: school,
        league: "NCAA",
        gamesPlayed: g,
        pointsPerGame: (Number(row.ppg) || 0).toFixed(1),
        reboundsPerGame: (Number(row.rpg) || 0).toFixed(1),
        assistsPerGame: (Number(row.apg) || 0).toFixed(1),
        stealsPerGame: (Number(row.spg) || 0).toFixed(1),
        blocksPerGame: (Number(row.bpg) || 0).toFixed(1),
        fieldGoalPct: (Number.isFinite(fgPct) ? (fgPct > 1 ? fgPct : fgPct * 100) : 0).toFixed(1),
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

/** Accept HTML from a roster page (e.g. from local script), parse and import. Same storage as NBA. */
export async function importNcaaRosterHtml(schoolSlug: string, year: number, html: string): Promise<NcaaImportResult> {
  const schoolName = parseSchoolName(html, schoolSlug) || schoolSlug;
  const season = endYearToSeason(year);
  const rows = parsePerGameTable(html);
  const importRows: NcaaImportRow[] = rows.map((r) => ({
    name: r.name,
    school: schoolName,
    season,
    g: r.g,
    ppg: r.ppg,
    rpg: r.rpg,
    apg: r.apg,
    spg: r.spg,
    bpg: r.bpg,
    fg_pct: r.fgPct * 100,
  }));
  return importNcaaPlayerSeasons(importRows);
}
