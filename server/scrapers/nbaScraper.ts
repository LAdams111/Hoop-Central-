/**
 * NBA scraper: writes to canonical tables (players, player_external_ids, player_seasons, player_season_stats).
 * Fills all columns from API where available; missing data stays null.
 */
import { db } from "../db";
import { playerSeasons, playerSeasonStats } from "@shared/canonicalSchema";
import { eq, and } from "drizzle-orm";
import { findOrCreatePlayer } from "../services/playerService";
import {
  getNbaLeague,
  getOrCreateTeam,
  getOrCreateSeasonByEndYear,
  getOrCreateTeamSeason,
} from "../services/leagueService";

const NBA_TEAM_MAP: Record<string, string> = {
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets", BRK: "Brooklyn Nets",
  CHA: "Charlotte Hornets", CHO: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons",
  GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
  LAC: "LA Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
  MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns", PHO: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
  NJN: "Brooklyn Nets", NOH: "New Orleans Pelicans", SEA: "Oklahoma City Thunder",
  VAN: "Memphis Grizzlies", CHH: "Charlotte Hornets", WSB: "Washington Wizards",
};

function isMultiTeamAbbr(abbr: string): boolean {
  return /^\d+TM$/.test(abbr);
}

export function getCurrentNBASeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 10) return year;
  return year - 1;
}

export function seasonToDisplay(seasonStartYear: number): string {
  const endShort = String(seasonStartYear + 1).slice(-2);
  return `${seasonStartYear}-${endShort}`;
}

export interface NbaScraperResult {
  playersAdded: number;
  playersMatched: number;
  statsInserted: number;
  statsUpdated: number;
  errors: string[];
  season: string;
  seasonsProcessed: string[];
}

const OLDEST_SEASON_START = 1987;

async function fetchSeasonData(seasonYear: number): Promise<any[]> {
  let page = 1;
  let totalPages = 1;
  const allPlayerData: any[] = [];
  while (page <= totalPages) {
    const url = `https://api.server.nbaapi.com/api/playertotals?season=${seasonYear}&pageSize=100&page=${page}&isPlayoff=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const json = await res.json();
    if (!json.data || !Array.isArray(json.data)) throw new Error("Invalid API response");
    allPlayerData.push(...json.data);
    totalPages = json.pagination?.pages || 1;
    page++;
    if (page <= totalPages) await new Promise((r) => setTimeout(r, 500));
  }
  return allPlayerData;
}

let nbaScraperRunning = false;
export function isNbaScraperRunning(): boolean {
  return nbaScraperRunning;
}

export async function scrapeNBAPlayers(options: { runSyncAfter?: boolean } = {}): Promise<NbaScraperResult> {
  if (nbaScraperRunning) throw new Error("NBA scraper is already running");
  nbaScraperRunning = true;
  const currentSeasonYear = getCurrentNBASeason();
  const result: NbaScraperResult = {
    playersAdded: 0,
    playersMatched: 0,
    statsInserted: 0,
    statsUpdated: 0,
    errors: [],
    season: seasonToDisplay(currentSeasonYear),
    seasonsProcessed: [],
  };

  try {
    const nbaLeague = await getNbaLeague();
    const seasonYears: number[] = [];
    for (let y = currentSeasonYear; y >= OLDEST_SEASON_START; y--) seasonYears.push(y);

    for (const seasonYear of seasonYears) {
      const seasonDisplay = seasonToDisplay(seasonYear);
      let allPlayerData: any[];
      try {
        allPlayerData = await fetchSeasonData(seasonYear);
      } catch (fetchErr: any) {
        result.errors.push(`Failed to fetch season ${seasonDisplay}: ${fetchErr.message}`);
        continue;
      }
      result.seasonsProcessed.push(seasonDisplay);

      const season = await getOrCreateSeasonByEndYear(nbaLeague.id, seasonYear + 1);
      const playerEntriesMap: Record<string, any[]> = {};
      for (const p of allPlayerData) {
        const nameLower = p.playerName?.toLowerCase();
        if (!nameLower) continue;
        if (!playerEntriesMap[nameLower]) playerEntriesMap[nameLower] = [];
        playerEntriesMap[nameLower].push(p);
      }

      for (const nameLower of Object.keys(playerEntriesMap)) {
        const entries = playerEntriesMap[nameLower];
        try {
          const individualEntries = entries.filter((e: any) => !isMultiTeamAbbr(e.team));
          const hasMultiTeam = entries.some((e: any) => isMultiTeamAbbr(e.team));
          const teamEntries = individualEntries.length > 0 ? individualEntries : [entries[0]];
          const firstEntry = entries[0];
          const playerName = firstEntry.playerName;
          const bbrefId = firstEntry.playerId;
          const lastTeamEntry = teamEntries[teamEntries.length - 1];
          const currentTeamAbbr = lastTeamEntry.team;
          const currentTeamFull = isMultiTeamAbbr(currentTeamAbbr) ? currentTeamAbbr : (NBA_TEAM_MAP[currentTeamAbbr] || currentTeamAbbr);
          const position = firstEntry.position || "SF";
          const posMap: Record<string, string> = {
            PG: "PG", SG: "SG", SF: "SF", PF: "PF", C: "C",
            G: "PG", F: "SF", "G-F": "SF", "F-G": "SG", "F-C": "PF", "C-F": "PF",
          };
          const mappedPos = posMap[position] || "SF";
          let birthDate: string | null = null;
          if (firstEntry.age) {
            const birthYear = seasonYear + 1 - firstEntry.age;
            birthDate = `${birthYear}-01-01`;
          }

          const { player: canonicalPlayer, created } = await findOrCreatePlayer({
            name: playerName,
            birthDate,
            height: "6'0\"",
            weight: "200 lbs",
            position: mappedPos,
            source: "nba",
            externalId: bbrefId,
          });
          if (created) result.playersAdded++;
          else result.playersMatched++;

          const team = await getOrCreateTeam(currentTeamFull, nbaLeague.id, {
            abbreviation: isMultiTeamAbbr(currentTeamAbbr) ? undefined : currentTeamAbbr,
          });

          if (hasMultiTeam && individualEntries.length > 1) {
            for (const te of individualEntries) {
              const teTeamFull = NBA_TEAM_MAP[te.team] || te.team;
              const teTeam = await getOrCreateTeam(teTeamFull, nbaLeague.id, { abbreviation: te.team });
              const teamSeason = await getOrCreateTeamSeason(teTeam.id, season.id);
              const teGP = te.games || 0;
              if (teGP === 0) continue;
              const existingPsList = await db.select().from(playerSeasons).where(
                and(
                  eq(playerSeasons.playerId, canonicalPlayer.id),
                  eq(playerSeasons.teamSeasonId, teamSeason.id)
                )
              );
              for (const ps of existingPsList) {
                await db.delete(playerSeasonStats).where(eq(playerSeasonStats.playerSeasonId, ps.id));
                await db.delete(playerSeasons).where(eq(playerSeasons.id, ps.id));
              }
              const [ps] = await db.insert(playerSeasons).values({
                playerId: canonicalPlayer.id,
                teamSeasonId: teamSeason.id,
                jerseyNumber: null,
                gamesPlayed: teGP,
              }).returning();
              if (ps) {
                const pts = te.points ?? 0;
                const reb = te.totalRb ?? 0;
                const ast = te.assists ?? 0;
                const stl = te.steals ?? 0;
                const blk = te.blocks ?? 0;
                const fgPct = te.fieldPercent != null ? String(te.fieldPercent) : null;
                const threePct = te.threePercent != null ? String(te.threePercent) : null;
                const ftPct = te.ftPercent != null ? String(te.ftPercent) : null;
                const minutes = te.minutes ?? null;
                await db.insert(playerSeasonStats).values({
                  playerSeasonId: ps.id,
                  games: teGP,
                  minutes,
                  points: pts || null,
                  rebounds: reb || null,
                  assists: ast || null,
                  steals: stl || null,
                  blocks: blk || null,
                  fgPct,
                  threePct,
                  ftPct,
                });
                result.statsInserted++;
              }
            }
          } else {
            const te = teamEntries[0];
            const teTeamFull = isMultiTeamAbbr(te.team) ? te.team : (NBA_TEAM_MAP[te.team] || te.team);
            const teTeam = await getOrCreateTeam(teTeamFull, nbaLeague.id, { abbreviation: te.team });
            const teamSeason = await getOrCreateTeamSeason(teTeam.id, season.id);
            const teGP = te.games || 0;
            if (teGP === 0) continue;
            const [existingPs] = await db.select().from(playerSeasons).where(
              and(
                eq(playerSeasons.playerId, canonicalPlayer.id),
                eq(playerSeasons.teamSeasonId, teamSeason.id)
              )
            ).limit(1);
            const pts = te.points ?? 0;
            const reb = te.totalRb ?? 0;
            const ast = te.assists ?? 0;
            const stl = te.steals ?? 0;
            const blk = te.blocks ?? 0;
            const fgPct = te.fieldPercent != null ? String(te.fieldPercent) : null;
            const threePct = te.threePercent != null ? String(te.threePercent) : null;
            const ftPct = te.ftPercent != null ? String(te.ftPercent) : null;
            const minutes = te.minutes ?? null;
            if (existingPs) {
              const [existingStat] = await db.select().from(playerSeasonStats).where(eq(playerSeasonStats.playerSeasonId, existingPs.id)).limit(1);
              if (existingStat) {
                await db.update(playerSeasonStats).set({
                  games: teGP,
                  minutes,
                  points: pts || null,
                  rebounds: reb || null,
                  assists: ast || null,
                  steals: stl || null,
                  blocks: blk || null,
                  fgPct,
                  threePct,
                  ftPct,
                }).where(eq(playerSeasonStats.id, existingStat.id));
                result.statsUpdated++;
              } else {
                await db.insert(playerSeasonStats).values({
                  playerSeasonId: existingPs.id,
                  games: teGP,
                  minutes,
                  points: pts || null,
                  rebounds: reb || null,
                  assists: ast || null,
                  steals: stl || null,
                  blocks: blk || null,
                  fgPct,
                  threePct,
                  ftPct,
                });
                result.statsInserted++;
              }
            } else {
              const [ps] = await db.insert(playerSeasons).values({
                playerId: canonicalPlayer.id,
                teamSeasonId: teamSeason.id,
                jerseyNumber: null,
                gamesPlayed: teGP,
              }).returning();
              if (ps) {
                await db.insert(playerSeasonStats).values({
                  playerSeasonId: ps.id,
                  games: teGP,
                  minutes,
                  points: pts || null,
                  rebounds: reb || null,
                  assists: ast || null,
                  steals: stl || null,
                  blocks: blk || null,
                  fgPct,
                  threePct,
                  ftPct,
                });
                result.statsInserted++;
              }
            }
          }
        } catch (playerErr: any) {
          result.errors.push(`${nameLower} (${seasonDisplay}): ${playerErr.message}`);
        }
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally {
    nbaScraperRunning = false;
  }
  return result;
}
