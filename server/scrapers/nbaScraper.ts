/**
 * NBA scraper: writes to canonical tables (players, player_external_ids, player_seasons, player_season_stats).
 * Run sync after to populate player_info / player_stats for the frontend.
 */
import { db } from "../db";
import { playerSeasons, playerSeasonStats } from "@shared/canonicalSchema";
import { eq, and } from "drizzle-orm";
import { findOrCreatePlayer } from "../services/playerService";
import { getNbaLeague, getOrCreateTeam, getOrCreateSeasonByEndYear } from "../services/leagueService";
import { syncFrontendTables } from "../sync/syncFrontendTables";

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
  syncResult?: { playersUpserted: number; statsDeleted: number; statsInserted: number };
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
  const runSyncAfter = options.runSyncAfter !== false;
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
    const playerCache = new Map<string, number>();

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

      const season = await getOrCreateSeasonByEndYear(seasonYear + 1);
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

          const teamSlug = (currentTeamAbbr || "unknown").toLowerCase().replace(/\s+/g, "-");
          const team = await getOrCreateTeam(currentTeamFull, teamSlug, nbaLeague.id, undefined, undefined);

          if (hasMultiTeam && individualEntries.length > 1) {
            const existingPsList = await db.select().from(playerSeasons).where(
              and(
                eq(playerSeasons.playerId, canonicalPlayer.id),
                eq(playerSeasons.teamId, team.id),
                eq(playerSeasons.seasonId, season.id)
              )
            );
            for (const ps of existingPsList) {
              await db.delete(playerSeasonStats).where(eq(playerSeasonStats.playerSeasonId, ps.id));
              await db.delete(playerSeasons).where(eq(playerSeasons.id, ps.id));
            }
            for (const te of individualEntries) {
              const teTeamFull = NBA_TEAM_MAP[te.team] || te.team;
              const teSlug = (te.team || "x").toLowerCase().replace(/\s+/g, "-");
              const teTeam = await getOrCreateTeam(teTeamFull, teSlug, nbaLeague.id);
              const teGP = te.games || 0;
              if (teGP === 0) continue;
              const [ps] = await db.insert(playerSeasons).values({
                playerId: canonicalPlayer.id,
                teamId: teTeam.id,
                leagueId: nbaLeague.id,
                seasonId: season.id,
                jersey: 0,
                games: teGP,
              }).returning();
              if (ps) {
                await db.insert(playerSeasonStats).values({
                  playerSeasonId: ps.id,
                  ptsPerG: ((te.points || 0) / teGP).toFixed(1),
                  trbPerG: ((te.totalRb || 0) / teGP).toFixed(1),
                  astPerG: ((te.assists || 0) / teGP).toFixed(1),
                  stlPerG: ((te.steals || 0) / teGP).toFixed(1),
                  blkPerG: ((te.blocks || 0) / teGP).toFixed(1),
                  fgPct: te.fieldPercent ? (te.fieldPercent * 100).toFixed(1) : "0",
                });
                result.statsInserted++;
              }
            }
          } else {
            const te = teamEntries[0];
            const teTeamFull = isMultiTeamAbbr(te.team) ? te.team : (NBA_TEAM_MAP[te.team] || te.team);
            const teTeam = await getOrCreateTeam(teTeamFull, (te.team || "x").toLowerCase().replace(/\s+/g, "-"), nbaLeague.id);
            const teGP = te.games || 0;
            if (teGP === 0) continue;
            const [existingPs] = await db.select().from(playerSeasons).where(
              and(
                eq(playerSeasons.playerId, canonicalPlayer.id),
                eq(playerSeasons.teamId, teTeam.id),
                eq(playerSeasons.seasonId, season.id)
              )
            ).limit(1);
            const ppg = ((te.points || 0) / teGP).toFixed(1);
            const rpg = ((te.totalRb || 0) / teGP).toFixed(1);
            const apg = ((te.assists || 0) / teGP).toFixed(1);
            const spg = ((te.steals || 0) / teGP).toFixed(1);
            const bpg = ((te.blocks || 0) / teGP).toFixed(1);
            const fg = te.fieldPercent ? (te.fieldPercent * 100).toFixed(1) : "0";
            if (existingPs) {
              const [existingStat] = await db.select().from(playerSeasonStats).where(eq(playerSeasonStats.playerSeasonId, existingPs.id)).limit(1);
              if (existingStat) {
                await db.update(playerSeasonStats).set({ ptsPerG: ppg, trbPerG: rpg, astPerG: apg, stlPerG: spg, blkPerG: bpg, fgPct: fg }).where(eq(playerSeasonStats.id, existingStat.id));
                result.statsUpdated++;
              } else {
                await db.insert(playerSeasonStats).values({ playerSeasonId: existingPs.id, ptsPerG: ppg, trbPerG: rpg, astPerG: apg, stlPerG: spg, blkPerG: bpg, fgPct: fg });
                result.statsInserted++;
              }
            } else {
              const [ps] = await db.insert(playerSeasons).values({
                playerId: canonicalPlayer.id,
                teamId: teTeam.id,
                leagueId: nbaLeague.id,
                seasonId: season.id,
                jersey: 0,
                games: teGP,
              }).returning();
              if (ps) {
                await db.insert(playerSeasonStats).values({ playerSeasonId: ps.id, ptsPerG: ppg, trbPerG: rpg, astPerG: apg, stlPerG: spg, blkPerG: bpg, fgPct: fg });
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

    if (runSyncAfter) {
      const syncResult = await syncFrontendTables();
      result.syncResult = { playersUpserted: syncResult.playersUpserted, statsDeleted: syncResult.statsDeleted, statsInserted: syncResult.statsInserted };
    }
  } finally {
    nbaScraperRunning = false;
  }
  return result;
}
