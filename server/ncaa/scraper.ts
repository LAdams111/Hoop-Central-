/**
 * Main NCAA scraper: team season pages → roster + per_game stats, then player bio pages.
 * Upserts player_info and player_stats. Uses existing DB schema; 2s delay between requests.
 */

import { db } from "../db";
import { storage } from "../storage";
import { players, playerStats } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { fetchPage, stripComments } from "./request";
import { getSchoolSlugs } from "./teams";
import { parseRoster } from "./parseRoster";
import { parseStats } from "./parseStats";
import { parsePlayerBio } from "./parsePlayerBio";

const BASE_URL = "https://www.sports-reference.com";
const DELAY_MS = 2000;

function teamSeasonUrl(slug: string, year: number): string {
  return `${BASE_URL}/cbb/schools/${slug}/${year}.html`;
}

function endYearToSeason(endYear: number): string {
  const start = endYear - 1;
  const endStr = String(endYear).slice(-2);
  return `${start}-${endStr}`;
}

function parseSchoolName(html: string, slug: string): string {
  const match = html.match(/<title>([^|]+)\s*\|/i);
  if (match) {
    const t = match[1].trim();
    const m = t.match(/\d{4}-\d{2}\s+(.+?)\s+Men's Roster/i);
    if (m) return m[1].trim();
  }
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const POS_MAP: Record<string, string> = {
  G: "PG", "G-F": "SG", F: "SF", "F-G": "SF", "F-C": "PF", C: "C", "C-F": "PF",
};

function normPos(pos: string | undefined): string {
  if (!pos) return "G";
  const p = pos.toLowerCase();
  if (["pg", "sg", "sf", "pf", "c", "g", "f"].includes(p)) return pos;
  if (p.includes("guard")) return "G";
  if (p.includes("forward")) return "F";
  if (p.includes("center")) return "C";
  return POS_MAP[pos] || "G";
}

function toNum(val: number | null | undefined): number {
  return val != null && Number.isFinite(val) ? val : 0;
}

export interface NcaaScraperOptions {
  schoolSlugs?: string[];
  maxSchools?: number;
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
  pages429?: number;
  pagesParseZero?: number;
}

let running = false;
let lastResult: NcaaScraperResult | null = null;
let lastCompletedAt: Date | null = null;

export function isNcaaScraperRunning(): boolean {
  return running;
}

export function getLastNcaaScraperResult(): { result: NcaaScraperResult; completedAt: Date } | null {
  if (!lastResult || !lastCompletedAt) return null;
  return { result: lastResult, completedAt: lastCompletedAt };
}

export async function runNcaaScraper(options: NcaaScraperOptions = {}): Promise<NcaaScraperResult> {
  if (running) throw new Error("NCAA scraper is already running");
  running = true;

  const currentYear = new Date().getFullYear();
  const startYear = options.startYear ?? currentYear;
  const endYear = options.endYear ?? Math.max(currentYear - 3, 2000);
  const delayMs = options.delayMs ?? DELAY_MS;
  const slugs = options.schoolSlugs ?? getSchoolSlugs(options.maxSchools);

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
    for (const slug of slugs) {
      let schoolName: string | null = null;

      for (let year = startYear; year >= endYear; year--) {
        const season = endYearToSeason(year);
        const url = teamSeasonUrl(slug, year);
        console.log("[scraper] team:", slug, "season:", season);

        let html: string;
        try {
          html = await fetchPage(url, { delayAfterMs: delayMs });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("429")) {
            result.pages429!++;
            result.errors.push(`${slug}/${year}: HTTP 429`);
          } else {
            result.errors.push(`${slug}/${year}: ${msg}`);
          }
          console.error("[scraper] fetch error:", slug, year, msg);
          continue;
        }

        if (!html) {
          result.pagesParseZero!++;
          continue;
        }

        const cleanHtml = html
          .replace(/<!--/g, "")
          .replace(/-->/g, "");

        if (!schoolName) schoolName = parseSchoolName(html, slug);

        const roster = parseRoster(cleanHtml);
        const statsByPlayer = parseStats(cleanHtml);
        console.log("[scraper] players parsed:", roster.length, "stats parsed:", Object.keys(statsByPlayer).length);

        if (roster.length === 0) {
          result.pagesParseZero!++;
          continue;
        }

        for (const player of roster) {
          try {
            const nameNorm = player.name.trim().toLowerCase();
            const stats = statsByPlayer[player.name.trim()] ?? statsByPlayer[player.name.trim().replace(/\s+/g, " ")];

            let playerId = playerCache.get(nameNorm);
            if (playerId == null) {
              const existing = await db
                .select()
                .from(players)
                .where(sql`LOWER(TRIM(${players.name})) = ${nameNorm}`)
                .limit(1);
              if (existing.length > 0) {
                playerId = existing[0].id;
                result.playersMatched++;
              } else {
                let bioData: { height?: string; weight?: string; position?: string; hometown?: string; birth_date?: string; high_school?: string } = {};
                if (player.player_url) {
                  try {
                    const bioHtml = await fetchPage(player.player_url, { delayAfterMs: delayMs });
                    if (bioHtml) bioData = parsePlayerBio(bioHtml);
                  } catch {
                    // skip bio on error
                  }
                }
                const position = normPos(bioData.position || POS_MAP[player.class] || "G");
                const height = (bioData.height && bioData.height.length <= 30) ? bioData.height : "—";
                const weight = (bioData.weight && bioData.weight.length <= 30) ? bioData.weight : "—";
                const bio = bioData.high_school ? `High School: ${bioData.high_school}` : undefined;
                const newPlayer = await storage.createPlayer({
                  name: player.name.trim(),
                  position,
                  team: schoolName ?? slug,
                  height,
                  weight,
                  jerseyNumber: player.jersey_number || 0,
                  headshotUrl: "",
                  hometown: bioData.hometown,
                  birthDate: bioData.birth_date,
                  bio,
                });
                playerId = newPlayer.id;
                result.playersAdded++;
              }
              playerCache.set(nameNorm, playerId);
            }

            const g = toNum(stats?.games) || 1;
            const ppg = toNum(stats?.pts_per_g);
            const rpg = toNum(stats?.trb_per_g);
            const apg = toNum(stats?.ast_per_g);
            const spg = toNum(stats?.stl_per_g);
            const bpg = toNum(stats?.blk_per_g);
            let fgPct = toNum(stats?.fg_pct);
            if (fgPct > 1) fgPct /= 100;

            const teamDisplay = schoolName ?? slug;
            const existingStat = await db
              .select()
              .from(playerStats)
              .where(
                and(
                  eq(playerStats.playerId, playerId),
                  sql`CAST(${playerStats.season} AS text) = ${season}`,
                  eq(playerStats.league, "NCAA"),
                  sql`LOWER(${playerStats.team}) = ${teamDisplay.toLowerCase()}`
                )
              )
              .limit(1);

            const statRow = {
              playerId,
              season,
              team: teamDisplay,
              league: "NCAA" as const,
              gamesPlayed: g,
              pointsPerGame: ppg.toFixed(1),
              reboundsPerGame: rpg.toFixed(1),
              assistsPerGame: apg.toFixed(1),
              stealsPerGame: spg.toFixed(1),
              blocksPerGame: bpg.toFixed(1),
              fieldGoalPct: (fgPct > 1 ? fgPct : fgPct * 100).toFixed(1),
            };

            if (existingStat.length > 0) {
              await db
                .update(playerStats)
                .set({
                  gamesPlayed: statRow.gamesPlayed,
                  pointsPerGame: statRow.pointsPerGame,
                  reboundsPerGame: statRow.reboundsPerGame,
                  assistsPerGame: statRow.assistsPerGame,
                  stealsPerGame: statRow.stealsPerGame,
                  blocksPerGame: statRow.blocksPerGame,
                  fieldGoalPct: statRow.fieldGoalPct,
                })
                .where(eq(playerStats.id, existingStat[0].id));
              result.statsUpdated++;
            } else {
              await storage.createPlayerStats(statRow);
              result.statsInserted++;
            }
          } catch (rowErr) {
            const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
            result.errors.push(`${slug}/${year} ${player.name}: ${msg}`);
            console.error("[scraper] row error:", player.name, msg);
          }
        }

        result.schoolsProcessed++;
      }

      if (!schoolName) result.schoolsSkipped++;
    }
  } finally {
    running = false;
    lastResult = result;
    lastCompletedAt = new Date();
    console.log(
      "[scraper] Done: schools=" + result.schoolsProcessed +
      ", playersAdded=" + result.playersAdded +
      ", playersMatched=" + result.playersMatched +
      ", statsInserted=" + result.statsInserted +
      ", statsUpdated=" + result.statsUpdated +
      (result.errors.length ? ", errors=" + result.errors.length : "")
    );
  }

  return result;
}

/** Test fetch one team season page; returns parse diagnostics. */
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
  const url = teamSeasonUrl(slug, year);
  try {
    const html = await fetchPage(url, { delayAfterMs: DELAY_MS });
    const cleaned = stripComments(html);
    const hasRosterTable = /id="roster"/i.test(cleaned);
    const roster = parseRoster(html);
    return {
      url,
      status: 200,
      contentLength: html.length,
      hasRosterTable,
      playerRowsFound: roster.length,
      sampleNames: roster.slice(0, 5).map((r) => r.name),
      rateLimited: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      url,
      status: msg.includes("429") ? 429 : 0,
      contentLength: 0,
      hasRosterTable: false,
      playerRowsFound: 0,
      sampleNames: [],
      error: msg,
      rateLimited: msg.includes("429"),
    };
  }
}

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

/** Import NCAA player-season stats from JSON (e.g. POST /api/ncaa/import). */
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
      if (playerId == null) {
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
      const g = Math.max(0, Math.floor(Number(row.g) || 0));
      if (g === 0) continue;
      const existingStat = await db.select().from(playerStats).where(
        and(
          eq(playerStats.playerId, playerId),
          sql`CAST(${playerStats.season} AS text) = ${season}`,
          eq(playerStats.league, "NCAA"),
          sql`LOWER(${playerStats.team}) = ${school.toLowerCase()}`
        )
      ).limit(1);
      const fgRaw = Number(row.fg_pct) ?? 0;
      const statRow = {
        playerId,
        season,
        team: school,
        league: "NCAA" as const,
        gamesPlayed: g,
        pointsPerGame: (Number(row.ppg) ?? 0).toFixed(1),
        reboundsPerGame: (Number(row.rpg) ?? 0).toFixed(1),
        assistsPerGame: (Number(row.apg) ?? 0).toFixed(1),
        stealsPerGame: (Number(row.spg) ?? 0).toFixed(1),
        blocksPerGame: (Number(row.bpg) ?? 0).toFixed(1),
        fieldGoalPct: (fgRaw > 1 ? fgRaw : fgRaw * 100).toFixed(1),
      };
      if (existingStat.length > 0) {
        await db.update(playerStats).set({
          gamesPlayed: statRow.gamesPlayed,
          pointsPerGame: statRow.pointsPerGame,
          reboundsPerGame: statRow.reboundsPerGame,
          assistsPerGame: statRow.assistsPerGame,
          stealsPerGame: statRow.stealsPerGame,
          blocksPerGame: statRow.blocksPerGame,
          fieldGoalPct: statRow.fieldGoalPct,
        }).where(eq(playerStats.id, existingStat[0].id));
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

/** Import from raw HTML (e.g. POST /api/ncaa/import-html). Uses parseRoster + parseStats, then upserts. */
export async function importNcaaRosterHtml(schoolSlug: string, year: number, html: string): Promise<NcaaImportResult> {
  const cleaned = stripComments(html);
  const schoolName = parseSchoolName(html, schoolSlug) || schoolSlug;
  const season = endYearToSeason(year);
  const roster = parseRoster(cleaned);
  const statsByPlayer = parseStats(cleaned);
  const result: NcaaImportResult = { playersAdded: 0, playersMatched: 0, statsInserted: 0, statsUpdated: 0, errors: [] };
  const playerCache = new Map<string, number>();

  for (const player of roster) {
    try {
      const nameNorm = player.name.trim().toLowerCase();
      const stats = statsByPlayer[player.name.trim()] ?? statsByPlayer[player.name.trim().replace(/\s+/g, " ")];
      let playerId = playerCache.get(nameNorm);
      if (playerId == null) {
        const existing = await db.select().from(players).where(sql`LOWER(TRIM(${players.name})) = ${nameNorm}`).limit(1);
        if (existing.length > 0) {
          playerId = existing[0].id;
          result.playersMatched++;
        } else {
          const newPlayer = await storage.createPlayer({
            name: player.name.trim(),
            position: "G",
            team: schoolName,
            height: "—",
            weight: "—",
            jerseyNumber: player.jersey_number || 0,
            headshotUrl: "",
          });
          playerId = newPlayer.id;
          result.playersAdded++;
        }
        playerCache.set(nameNorm, playerId);
      }
      const g = toNum(stats?.games) || 1;
      const ppg = toNum(stats?.pts_per_g);
      const rpg = toNum(stats?.trb_per_g);
      const apg = toNum(stats?.ast_per_g);
      const spg = toNum(stats?.stl_per_g);
      const bpg = toNum(stats?.blk_per_g);
      let fgPct = toNum(stats?.fg_pct);
      if (fgPct > 1) fgPct /= 100;
      const existingStat = await db.select().from(playerStats).where(
        and(
          eq(playerStats.playerId, playerId),
          sql`CAST(${playerStats.season} AS text) = ${season}`,
          eq(playerStats.league, "NCAA"),
          sql`LOWER(${playerStats.team}) = ${schoolName.toLowerCase()}`
        )
      ).limit(1);
      const statRow = {
        playerId,
        season,
        team: schoolName,
        league: "NCAA" as const,
        gamesPlayed: g,
        pointsPerGame: ppg.toFixed(1),
        reboundsPerGame: rpg.toFixed(1),
        assistsPerGame: apg.toFixed(1),
        stealsPerGame: spg.toFixed(1),
        blocksPerGame: bpg.toFixed(1),
        fieldGoalPct: (fgPct > 1 ? fgPct : fgPct * 100).toFixed(1),
      };
      if (existingStat.length > 0) {
        await db.update(playerStats).set({
          gamesPlayed: statRow.gamesPlayed,
          pointsPerGame: statRow.pointsPerGame,
          reboundsPerGame: statRow.reboundsPerGame,
          assistsPerGame: statRow.assistsPerGame,
          stealsPerGame: statRow.stealsPerGame,
          blocksPerGame: statRow.blocksPerGame,
          fieldGoalPct: statRow.fieldGoalPct,
        }).where(eq(playerStats.id, existingStat[0].id));
        result.statsUpdated++;
      } else {
        await storage.createPlayerStats(statRow);
        result.statsInserted++;
      }
    } catch (err) {
      result.errors.push(`${player.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}
