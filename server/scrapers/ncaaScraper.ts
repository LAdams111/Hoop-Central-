/**
 * NCAA scraper: writes to canonical tables (players, player_external_ids, player_seasons, player_season_stats).
 * Run sync after to populate player_info / player_stats for the frontend.
 */
import { db } from "../db";
import { playerSeasons, playerSeasonStats } from "@shared/canonicalSchema";
import { eq, and } from "drizzle-orm";
import { findOrCreatePlayer, sportsRefSlugFromPlayerUrl } from "../services/playerService";
import { getNcaaLeague, getOrCreateTeam, getOrCreateSeasonByEndYear, getOrCreateTeamSeason } from "../services/leagueService";
import { fetchPage, stripComments } from "../ncaa/request";
import { getSchoolSlugs } from "../ncaa/teams";
import { parseRoster } from "../ncaa/parseRoster";
import { parseStats } from "../ncaa/parseStats";
import { parsePlayerBio } from "../ncaa/parsePlayerBio";

const BASE_URL = "https://www.sports-reference.com";
const DELAY_MS = 2000;

function teamSeasonUrl(slug: string, year: number): string {
  return `${BASE_URL}/cbb/schools/${slug}/men/${year}.html`;
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
  runSyncAfter?: boolean;
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
  syncResult?: { playersUpserted: number; statsDeleted: number; statsInserted: number };
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
  const runSyncAfter = options.runSyncAfter !== false;
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

  try {
    const ncaaLeague = await getNcaaLeague();

    for (const slug of slugs) {
      let schoolName: string | null = null;

      for (let year = startYear; year >= endYear; year--) {
        const seasonLabel = endYearToSeason(year);
        const url = teamSeasonUrl(slug, year);
        console.log("[scraper] team:", slug, "season:", seasonLabel);

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

        const cleanHtml = html.replace(/<!--/g, "").replace(/-->/g, "");
        if (!schoolName) schoolName = parseSchoolName(html, slug);

        const roster = parseRoster(cleanHtml);
        const statsByPlayer = parseStats(cleanHtml);

        if (roster.length === 0) {
          result.pagesParseZero!++;
          continue;
        }

        const season = await getOrCreateSeasonByEndYear(ncaaLeague.id, year);
        const team = await getOrCreateTeam(schoolName ?? slug, ncaaLeague.id);
        const teamSeason = await getOrCreateTeamSeason(team.id, season.id);

        for (const player of roster) {
          try {
            const nameTrimmed = player.name.trim();
            const stats = statsByPlayer[nameTrimmed] ?? statsByPlayer[nameTrimmed.replace(/\s+/g, " ")];
            const externalSlug = sportsRefSlugFromPlayerUrl(player.player_url);

            let bioData: { height?: string; weight?: string; position?: string; hometown?: string; birth_date?: string } = {};
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

            const canonicalPlayer = await findOrCreatePlayer({
              name: nameTrimmed,
              birthDate: bioData.birth_date ?? null,
              height,
              weight,
              position,
              source: "sports_reference",
              externalId: externalSlug ?? undefined,
            });

            const { player: p } = canonicalPlayer;
            if (canonicalPlayer.created) result.playersAdded++;
            else result.playersMatched++;

            const [existingPs] = await db
              .select()
              .from(playerSeasons)
              .where(
                and(
                  eq(playerSeasons.playerId, p.id),
                  eq(playerSeasons.teamSeasonId, teamSeason.id)
                )
              )
              .limit(1);

            let playerSeasonId: number;
            const games = toNum(stats?.games) || 1;
            const ppg = toNum(stats?.pts_per_g);
            const rpg = toNum(stats?.trb_per_g);
            const apg = toNum(stats?.ast_per_g);
            const spg = toNum(stats?.stl_per_g);
            const bpg = toNum(stats?.blk_per_g);
            let fgPct = toNum(stats?.fg_pct);
            if (fgPct > 1) fgPct /= 100;
            const points = Math.round(ppg * games);
            const rebounds = Math.round(rpg * games);
            const assists = Math.round(apg * games);
            const steals = Math.round(spg * games);
            const blocks = Math.round(bpg * games);
            const fgPctVal = fgPct > 1 ? fgPct / 100 : fgPct;

            if (existingPs) {
              playerSeasonId = existingPs.id;
              const [existingStat] = await db
                .select()
                .from(playerSeasonStats)
                .where(eq(playerSeasonStats.playerSeasonId, existingPs.id))
                .limit(1);
              if (existingStat) {
                await db
                  .update(playerSeasonStats)
                  .set({
                    games,
                    points: points || null,
                    rebounds: rebounds || null,
                    assists: assists || null,
                    steals: steals || null,
                    blocks: blocks || null,
                    fgPct: fgPctVal > 0 ? String(fgPctVal) : null,
                  })
                  .where(eq(playerSeasonStats.id, existingStat.id));
                result.statsUpdated++;
              } else {
                await db.insert(playerSeasonStats).values({
                  playerSeasonId: existingPs.id,
                  games,
                  points: points || null,
                  rebounds: rebounds || null,
                  assists: assists || null,
                  steals: steals || null,
                  blocks: blocks || null,
                  fgPct: fgPctVal > 0 ? String(fgPctVal) : null,
                });
                result.statsInserted++;
              }
            } else {
              const [ps] = await db
                .insert(playerSeasons)
                .values({
                  playerId: p.id,
                  teamSeasonId: teamSeason.id,
                  jerseyNumber: player.jersey_number ?? null,
                  gamesPlayed: games,
                })
                .returning();
              playerSeasonId = ps!.id;
              await db.insert(playerSeasonStats).values({
                playerSeasonId: ps!.id,
                games,
                points: points || null,
                rebounds: rebounds || null,
                assists: assists || null,
                steals: steals || null,
                blocks: blocks || null,
                fgPct: fgPctVal > 0 ? String(fgPctVal) : null,
              });
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

    if (runSyncAfter) {
      const { syncFrontendTables } = await import("../sync/syncFrontendTables");
      const syncResult = await syncFrontendTables();
      result.syncResult = {
        playersUpserted: syncResult.playersUpserted,
        statsDeleted: syncResult.statsDeleted,
        statsInserted: syncResult.statsInserted,
      };
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
      (result.syncResult ? ", sync players=" + result.syncResult.playersUpserted + " stats=" + result.syncResult.statsInserted : "") +
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

/** Import NCAA player-season stats from JSON (e.g. POST /api/ncaa/import). Writes to canonical then sync. */
export async function importNcaaPlayerSeasons(rows: NcaaImportRow[], runSyncAfter = true): Promise<NcaaImportResult> {
  const result: NcaaImportResult = { playersAdded: 0, playersMatched: 0, statsInserted: 0, statsUpdated: 0, errors: [] };
  const ncaaLeague = await getNcaaLeague();
  const playerCache = new Map<string, number>();

  for (const row of rows) {
    try {
      const nameNorm = row.name.trim().toLowerCase();
      const school = (row.school || "").trim();
      const seasonLabel = (row.season || "").trim();
      if (!nameNorm || !school || !seasonLabel) {
        result.errors.push("Missing name, school, or season");
        continue;
      }
      const { player, created } = await findOrCreatePlayer({
        name: row.name.trim(),
        position: "G",
        height: "—",
        weight: "—",
        source: "sports_reference",
        externalId: undefined,
      });
      if (created) result.playersAdded++;
      else result.playersMatched++;

      const team = await getOrCreateTeam(school, ncaaLeague.id);
      const parts = seasonLabel.split("-");
      const yearStart = parseInt(parts[0], 10) || new Date().getFullYear();
      const yearEnd = parts.length >= 2 && parts[1].length <= 2
        ? (parseInt(parts[1], 10) < 50 ? 2000 + parseInt(parts[1], 10) : 1900 + parseInt(parts[1], 10))
        : yearStart + 1;
      const season = await getOrCreateSeasonByEndYear(ncaaLeague.id, yearEnd);
      const teamSeason = await getOrCreateTeamSeason(team.id, season.id);
      const g = Math.max(0, Math.floor(Number(row.g) || 0));
      if (g === 0) continue;

      const [existingPs] = await db.select().from(playerSeasons).where(
        and(
          eq(playerSeasons.playerId, player.id),
          eq(playerSeasons.teamSeasonId, teamSeason.id)
        )
      ).limit(1);
      const ppg = Number(row.ppg) ?? 0;
      const rpg = Number(row.rpg) ?? 0;
      const apg = Number(row.apg) ?? 0;
      const spg = Number(row.spg) ?? 0;
      const bpg = Number(row.bpg) ?? 0;
      const fgRaw = Number(row.fg_pct) ?? 0;
      const fgPct = fgRaw > 1 ? fgRaw / 100 : fgRaw;
      const points = Math.round(ppg * g);
      const rebounds = Math.round(rpg * g);
      const assists = Math.round(apg * g);
      const steals = Math.round(spg * g);
      const blocks = Math.round(bpg * g);
      if (existingPs) {
        const [existingStat] = await db.select().from(playerSeasonStats).where(eq(playerSeasonStats.playerSeasonId, existingPs.id)).limit(1);
        if (existingStat) {
          await db.update(playerSeasonStats).set({
            games: g,
            points: points || null,
            rebounds: rebounds || null,
            assists: assists || null,
            steals: steals || null,
            blocks: blocks || null,
            fgPct: String(fgPct),
          }).where(eq(playerSeasonStats.id, existingStat.id));
          result.statsUpdated++;
        } else {
          await db.insert(playerSeasonStats).values({
            playerSeasonId: existingPs.id,
            games: g,
            points: points || null,
            rebounds: rebounds || null,
            assists: assists || null,
            steals: steals || null,
            blocks: blocks || null,
            fgPct: String(fgPct),
          });
          result.statsInserted++;
        }
      } else {
        const [ps] = await db.insert(playerSeasons).values({
          playerId: player.id,
          teamSeasonId: teamSeason.id,
          jerseyNumber: null,
          gamesPlayed: g,
        }).returning();
        if (ps) {
          await db.insert(playerSeasonStats).values({
            playerSeasonId: ps.id,
            games: g,
            points: points || null,
            rebounds: rebounds || null,
            assists: assists || null,
            steals: steals || null,
            blocks: blocks || null,
            fgPct: String(fgPct),
          });
          result.statsInserted++;
        }
      }
    } catch (err) {
      result.errors.push(`${row.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (runSyncAfter && (result.playersAdded + result.playersMatched + result.statsInserted + result.statsUpdated > 0)) {
    const { syncFrontendTables } = await import("../sync/syncFrontendTables");
    await syncFrontendTables();
  }
  return result;
}

/** Import from raw HTML (e.g. POST /api/ncaa/import-html). Writes to canonical then sync. */
export async function importNcaaRosterHtml(schoolSlug: string, year: number, html: string, runSyncAfter = true): Promise<NcaaImportResult> {
  const cleaned = stripComments(html);
  const schoolName = parseSchoolName(html, schoolSlug) || schoolSlug;
  const seasonLabel = endYearToSeason(year);
  const roster = parseRoster(cleaned);
  const statsByPlayer = parseStats(cleaned);
  const result: NcaaImportResult = { playersAdded: 0, playersMatched: 0, statsInserted: 0, statsUpdated: 0, errors: [] };
  const ncaaLeague = await getNcaaLeague();
  const team = await getOrCreateTeam(schoolName, ncaaLeague.id);
  const season = await getOrCreateSeasonByEndYear(ncaaLeague.id, year);
  const teamSeason = await getOrCreateTeamSeason(team.id, season.id);

  for (const player of roster) {
    try {
      const nameTrimmed = player.name.trim();
      const stats = statsByPlayer[nameTrimmed] ?? statsByPlayer[nameTrimmed.replace(/\s+/g, " ")];
      const externalSlug = sportsRefSlugFromPlayerUrl(player.player_url);
      const { player: p, created } = await findOrCreatePlayer({
        name: nameTrimmed,
        position: "G",
        height: "—",
        weight: "—",
        source: "sports_reference",
        externalId: externalSlug ?? undefined,
      });
      if (created) result.playersAdded++;
      else result.playersMatched++;
      const gamesPlayed = toNum(stats?.games) || 1;
      const ppgNum = toNum(stats?.pts_per_g);
      const rpgNum = toNum(stats?.trb_per_g);
      const apgNum = toNum(stats?.ast_per_g);
      const spgNum = toNum(stats?.stl_per_g);
      const bpgNum = toNum(stats?.blk_per_g);
      let fgPctNum = toNum(stats?.fg_pct);
      if (fgPctNum > 1) fgPctNum /= 100;
      const fgPctVal = fgPctNum > 1 ? fgPctNum / 100 : fgPctNum;
      const points = Math.round(ppgNum * gamesPlayed);
      const rebounds = Math.round(rpgNum * gamesPlayed);
      const assists = Math.round(apgNum * gamesPlayed);
      const steals = Math.round(spgNum * gamesPlayed);
      const blocks = Math.round(bpgNum * gamesPlayed);
      const [existingPs] = await db.select().from(playerSeasons).where(
        and(
          eq(playerSeasons.playerId, p.id),
          eq(playerSeasons.teamSeasonId, teamSeason.id)
        )
      ).limit(1);
      if (existingPs) {
        const [existingStat] = await db.select().from(playerSeasonStats).where(eq(playerSeasonStats.playerSeasonId, existingPs.id)).limit(1);
        if (existingStat) {
          await db.update(playerSeasonStats).set({
            games: gamesPlayed,
            points: points || null,
            rebounds: rebounds || null,
            assists: assists || null,
            steals: steals || null,
            blocks: blocks || null,
            fgPct: fgPctVal > 0 ? String(fgPctVal) : null,
          }).where(eq(playerSeasonStats.id, existingStat.id));
          result.statsUpdated++;
        } else {
          await db.insert(playerSeasonStats).values({
            playerSeasonId: existingPs.id,
            games: gamesPlayed,
            points: points || null,
            rebounds: rebounds || null,
            assists: assists || null,
            steals: steals || null,
            blocks: blocks || null,
            fgPct: fgPctVal > 0 ? String(fgPctVal) : null,
          });
          result.statsInserted++;
        }
      } else {
        const [ps] = await db.insert(playerSeasons).values({
          playerId: p.id,
          teamSeasonId: teamSeason.id,
          jerseyNumber: player.jersey_number ?? null,
          gamesPlayed,
        }).returning();
        if (ps) {
          await db.insert(playerSeasonStats).values({
            playerSeasonId: ps.id,
            games: gamesPlayed,
            points: points || null,
            rebounds: rebounds || null,
            assists: assists || null,
            steals: steals || null,
            blocks: blocks || null,
            fgPct: fgPctVal > 0 ? String(fgPctVal) : null,
          });
          result.statsInserted++;
        }
      }
    } catch (err) {
      result.errors.push(`${player.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (runSyncAfter && (result.playersAdded + result.playersMatched + result.statsInserted + result.statsUpdated > 0)) {
    const { syncFrontendTables } = await import("../sync/syncFrontendTables");
    await syncFrontendTables();
  }
  return result;
}
