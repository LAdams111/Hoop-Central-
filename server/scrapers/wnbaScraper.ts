/**
 * WNBA scraper: writes to the same canonical tables as the NBA scraper.
 * Uses: players, player_external_ids, player_seasons, player_season_stats, teams, seasons, team_seasons, leagues.
 * No new tables. No schema changes. Same insertion flow as NBA scraper.
 */
import * as cheerio from "cheerio";
import { db } from "../db";
import {
  leagues,
  seasons,
  teamSeasons,
  playerSeasons,
  playerSeasonStats,
  playerExternalIds,
  players,
} from "@shared/canonicalSchema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { findOrCreatePlayer } from "../services/playerService";
import {
  getWnbaLeague,
  getOrCreateTeam,
  getOrCreateSeasonByEndYear,
  getOrCreateTeamSeason,
} from "../services/leagueService";
import { fetchPage, stripComments } from "../ncaa/request";

const WNBA_BASE = "https://www.basketball-reference.com/wnba";
const DELAY_MS = 2000;

/** Basketball Reference WNBA team abbreviation → full name (matches client WNBA_TEAMS). */
const WNBA_TEAM_ABBR: Record<string, string> = {
  ATL: "Atlanta Dream",
  CHI: "Chicago Sky",
  CON: "Connecticut Sun",
  DAL: "Dallas Wings",
  GSV: "Golden State Valkyries",
  IND: "Indiana Fever",
  LVA: "Las Vegas Aces",
  LAS: "Los Angeles Sparks",
  MIN: "Minnesota Lynx",
  NYL: "New York Liberty",
  PHO: "Phoenix Mercury",
  PHX: "Phoenix Mercury",
  SEA: "Seattle Storm",
  WAS: "Washington Mystics",
};

function seasonToDisplay(year: number): string {
  const endShort = String(year + 1).slice(-2);
  return `${year}-${endShort}`;
}

/** Extract player slug from BR WNBA player URL: /wnba/players/c/clarkca02w.html → clarkca02w */
function slugFromPlayerHref(href: string | undefined): string | null {
  if (!href || typeof href !== "string") return null;
  const m = href.match(/\/wnba\/players\/[^/]+\/([^/.]+)(?:\.html)?$/i);
  return m ? m[1].trim() : null;
}

export interface WnbaScraperResult {
  playersAdded: number;
  playersMatched: number;
  statsInserted: number;
  statsUpdated: number;
  errors: string[];
  seasonsProcessed: string[];
}

export interface WnbaScraperOptions {
  startYear?: number;
  endYear?: number;
  delayMs?: number;
}

export interface WnbaClearResult {
  playerSeasonStatsDeleted: number;
  playerSeasonsDeleted: number;
  playerExternalIdsDeleted: number;
  playersDeleted: number;
  error?: string;
}

/** Remove all WNBA data from canonical tables so a full rescrape can run cleanly. */
export async function clearWnbaData(): Promise<WnbaClearResult> {
  const result: WnbaClearResult = {
    playerSeasonStatsDeleted: 0,
    playerSeasonsDeleted: 0,
    playerExternalIdsDeleted: 0,
    playersDeleted: 0,
  };
  try {
    const [wnbaLeague] = await db.select().from(leagues).where(eq(leagues.name, "WNBA")).limit(1);
    if (!wnbaLeague) return result;

    const wnbaSeasons = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.leagueId, wnbaLeague.id));
    const seasonIds = wnbaSeasons.map((s) => s.id);
    if (seasonIds.length === 0) return result;

    const wnbaTeamSeasons = await db
      .select({ id: teamSeasons.id })
      .from(teamSeasons)
      .where(inArray(teamSeasons.seasonId, seasonIds));
    const teamSeasonIds = wnbaTeamSeasons.map((t) => t.id);
    if (teamSeasonIds.length === 0) return result;

    const wnbaPlayerSeasons = await db
      .select({ id: playerSeasons.id, playerId: playerSeasons.playerId })
      .from(playerSeasons)
      .where(inArray(playerSeasons.teamSeasonId, teamSeasonIds));
    const playerSeasonIds = wnbaPlayerSeasons.map((p) => p.id);
    const wnbaPlayerIds = [...new Set(wnbaPlayerSeasons.map((p) => p.playerId))];

    if (playerSeasonIds.length > 0) {
      const r1 = await db.delete(playerSeasonStats).where(inArray(playerSeasonStats.playerSeasonId, playerSeasonIds));
      result.playerSeasonStatsDeleted = r1.rowCount ?? 0;
      const r2 = await db.delete(playerSeasons).where(inArray(playerSeasons.id, playerSeasonIds));
      result.playerSeasonsDeleted = r2.rowCount ?? 0;
    }

    if (wnbaPlayerIds.length > 0) {
      const r3 = await db.delete(playerExternalIds).where(
        and(eq(playerExternalIds.source, "wnba"), inArray(playerExternalIds.playerId, wnbaPlayerIds))
      );
      result.playerExternalIdsDeleted = r3.rowCount ?? 0;

      for (const playerId of wnbaPlayerIds) {
        const [hasSeasons] = await db.select().from(playerSeasons).where(eq(playerSeasons.playerId, playerId)).limit(1);
        const [hasExtId] = await db.select().from(playerExternalIds).where(eq(playerExternalIds.playerId, playerId)).limit(1);
        if (!hasSeasons && !hasExtId) {
          await db.delete(players).where(eq(players.id, playerId));
          result.playersDeleted++;
        }
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

let wnbaScraperRunning = false;
export function isWnbaScraperRunning(): boolean {
  return wnbaScraperRunning;
}

export async function scrapeWNBAPlayers(options: WnbaScraperOptions = {}): Promise<WnbaScraperResult> {
  if (wnbaScraperRunning) throw new Error("WNBA scraper is already running");
  wnbaScraperRunning = true;

  const currentYear = new Date().getFullYear();
  const startYear = options.startYear ?? currentYear;
  const endYear = options.endYear ?? 1997;
  const delayMs = options.delayMs ?? DELAY_MS;

  const result: WnbaScraperResult = {
    playersAdded: 0,
    playersMatched: 0,
    statsInserted: 0,
    statsUpdated: 0,
    errors: [],
    seasonsProcessed: [],
  };

  try {
    const wnbaLeague = await getWnbaLeague();

    for (let year = startYear; year >= endYear; year--) {
      const seasonLabel = seasonToDisplay(year);
      const url = `${WNBA_BASE}/years/${year}_totals.html`;

      let html: string;
      try {
        html = await fetchPage(url, { delayAfterMs: delayMs });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Season ${seasonLabel}: ${msg}`);
        continue;
      }

      const cleaned = stripComments(html);
      const $ = cheerio.load(cleaned);
      const $rows = $('table#totals tbody tr').filter((_, el) => {
        const $row = $(el);
        return $row.find('td[data-stat="player"]').length > 0 && !$row.hasClass('thead');
      });

      if ($rows.length === 0) {
        result.errors.push(`Season ${seasonLabel}: no player rows found`);
        continue;
      }

      result.seasonsProcessed.push(seasonLabel);
      const season = await getOrCreateSeasonByEndYear(wnbaLeague.id, year + 1);

      const rows: { name: string; slug: string | null; teamFull: string; teamAbbr: string; g: number; mp: number | null; pts: number; trb: number; ast: number; stl: number; blk: number; fgPct: string | null; threePct: string | null; ftPct: string | null; position: string }[] = [];
      $rows.each((_, el) => {
        const $row = $(el);
        const $playerCell = $row.find('td[data-stat="player"]');
        const $a = $playerCell.find('a');
        const href = $a.attr('href');
        const slug = slugFromPlayerHref(href);
        const name = ($a.text() || $playerCell.text()).trim();
        if (!name) return;
        const teamAbbr = ($row.find('td[data-stat="team_id"]').text() || "").trim().toUpperCase();
        const teamFull = WNBA_TEAM_ABBR[teamAbbr] || teamAbbr || "Unknown";
        const g = parseInt($row.find('td[data-stat="g"]').text(), 10) || 0;
        if (g === 0) return;
        const mpVal = parseInt($row.find('td[data-stat="mp"]').text(), 10);
        const mp = Number.isNaN(mpVal) ? null : mpVal;
        const pts = parseInt($row.find('td[data-stat="pts"]').text(), 10) || 0;
        const trb = parseInt($row.find('td[data-stat="trb"]').text(), 10) || 0;
        const ast = parseInt($row.find('td[data-stat="ast"]').text(), 10) || 0;
        const stl = parseInt($row.find('td[data-stat="stl"]').text(), 10) || 0;
        const blk = parseInt($row.find('td[data-stat="blk"]').text(), 10) || 0;
        const fgPctRaw = $row.find('td[data-stat="fg_pct"]').text().trim();
        const fg3PctRaw = $row.find('td[data-stat="fg3_pct"]').text().trim();
        const ftPctRaw = $row.find('td[data-stat="ft_pct"]').text().trim();
        const fgPct = fgPctRaw ? String(parseFloat(fgPctRaw) || 0) : null;
        const threePct = fg3PctRaw ? String(parseFloat(fg3PctRaw) || 0) : null;
        const ftPct = ftPctRaw ? String(parseFloat(ftPctRaw) || 0) : null;
        const posRaw = ($row.find('td[data-stat="pos"]').text() || "").trim();
        const posMap: Record<string, string> = { G: "PG", "G-F": "SG", F: "SF", "F-G": "SF", "F-C": "PF", C: "C", "C-F": "PF" };
        const position = posMap[posRaw] || posRaw || "G";
        rows.push({ name, slug, teamFull, teamAbbr, g, mp, pts, trb, ast, stl, blk, fgPct, threePct, ftPct, position });
      });

      for (const row of rows) {
        try {
          const { player: canonicalPlayer, created } = await findOrCreatePlayer({
            name: row.name,
            position: row.position,
            height: "—",
            weight: "—",
            source: "wnba",
            externalId: row.slug ?? undefined,
          });
          if (created) result.playersAdded++;
          else result.playersMatched++;

          const team = await getOrCreateTeam(row.teamFull, wnbaLeague.id, { abbreviation: row.teamAbbr || undefined });
          const teamSeason = await getOrCreateTeamSeason(team.id, season.id);

          const [existingPs] = await db.select().from(playerSeasons).where(
            and(
              eq(playerSeasons.playerId, canonicalPlayer.id),
              eq(playerSeasons.teamSeasonId, teamSeason.id)
            )
          ).limit(1);

          if (existingPs) {
            const [existingStat] = await db.select().from(playerSeasonStats).where(eq(playerSeasonStats.playerSeasonId, existingPs.id)).limit(1);
            if (existingStat) {
              await db.update(playerSeasonStats).set({
                games: row.g,
                minutes: row.mp,
                points: row.pts || null,
                rebounds: row.trb || null,
                assists: row.ast || null,
                steals: row.stl || null,
                blocks: row.blk || null,
                fgPct: row.fgPct,
                threePct: row.threePct,
                ftPct: row.ftPct,
              }).where(eq(playerSeasonStats.id, existingStat.id));
              result.statsUpdated++;
            } else {
              await db.insert(playerSeasonStats).values({
                playerSeasonId: existingPs.id,
                games: row.g,
                minutes: row.mp,
                points: row.pts || null,
                rebounds: row.trb || null,
                assists: row.ast || null,
                steals: row.stl || null,
                blocks: row.blk || null,
                fgPct: row.fgPct,
                threePct: row.threePct,
                ftPct: row.ftPct,
              });
              result.statsInserted++;
            }
          } else {
            const [ps] = await db.insert(playerSeasons).values({
              playerId: canonicalPlayer.id,
              teamSeasonId: teamSeason.id,
              jerseyNumber: null,
              gamesPlayed: row.g,
            }).returning();
            if (ps) {
              await db.insert(playerSeasonStats).values({
                playerSeasonId: ps.id,
                games: row.g,
                minutes: row.mp,
                points: row.pts || null,
                rebounds: row.trb || null,
                assists: row.ast || null,
                steals: row.stl || null,
                blocks: row.blk || null,
                fgPct: row.fgPct,
                threePct: row.threePct,
                ftPct: row.ftPct,
              });
              result.statsInserted++;
            }
          }
        } catch (e) {
          result.errors.push(`${row.name} (${seasonLabel}): ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      await new Promise((r) => setTimeout(r, delayMs));
    }
  } finally {
    wnbaScraperRunning = false;
  }

  return result;
}
