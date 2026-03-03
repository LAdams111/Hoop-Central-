import { storage } from "./storage";
import { db } from "./db";
import { players, playerStats } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

interface BioUpdateResult {
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

let bioScraperRunning = false;
export function isBioScraperRunning() { return bioScraperRunning; }

export async function updatePlayerBios(): Promise<BioUpdateResult> {
  if (bioScraperRunning) throw new Error("Bio scraper already running");
  bioScraperRunning = true;
  const result: BioUpdateResult = { updated: 0, skipped: 0, errors: [], total: 0 };

  try {
    const defaultPlayers = await db.select().from(players).where(
      and(
        sql`${players.height} = '6''0"'`,
        sql`${players.weight} = '200 lbs'`
      )
    );
    result.total = defaultPlayers.length;
    console.log(`[Bio Scraper] Found ${defaultPlayers.length} players with default height/weight`);

    let page = 1;
    let totalPages = 1;
    const apiPlayerMap = new Map<string, { playerId: string; playerName: string }>();

    while (page <= totalPages) {
      const url = `https://api.server.nbaapi.com/api/playertotals?season=${getCurrentNBASeason()}&pageSize=100&page=${page}&isPlayoff=false`;
      const res = await fetch(url);
      if (!res.ok) break;
      const json = await res.json();
      if (!json.data) break;
      for (const p of json.data) {
        apiPlayerMap.set(p.playerName.toLowerCase(), { playerId: p.playerId, playerName: p.playerName });
      }
      totalPages = json.pagination?.pages || 1;
      page++;
      if (page <= totalPages) await new Promise(r => setTimeout(r, 300));
    }
    console.log(`[Bio Scraper] Built API map with ${apiPlayerMap.size} players`);

    for (const player of defaultPlayers) {
      try {
        const apiEntry = apiPlayerMap.get(player.name.toLowerCase());
        if (!apiEntry) {
          result.skipped++;
          continue;
        }

        const brId = apiEntry.playerId;
        const firstLetter = brId.charAt(0);
        const brUrl = `https://www.basketball-reference.com/players/${firstLetter}/${brId}.html`;

        const response = await fetch(brUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
          },
        });

        if (!response.ok) {
          result.skipped++;
          continue;
        }

        const html = await response.text();

        let height: string | null = null;
        let weight: string | null = null;

        const heightJsonMatch = html.match(/"height"\s*:\s*\{\s*"@type"\s*:\s*"QuantitativeValue"\s*,\s*"value"\s*:\s*"([^"]+)"/);
        if (heightJsonMatch) {
          const raw = heightJsonMatch[1].trim();
          const parts = raw.match(/^(\d+)-(\d+)$/);
          if (parts) {
            height = `${parts[1]}'${parts[2]}"`;
          } else {
            height = raw;
          }
        }

        const weightJsonMatch = html.match(/"weight"\s*:\s*\{\s*"@type"\s*:\s*"QuantitativeValue"\s*,\s*"value"\s*:\s*"([^"]+)"/);
        if (weightJsonMatch) {
          const raw = weightJsonMatch[1].trim();
          weight = raw.includes("lbs") ? raw : `${raw} lbs`;
        }

        if (!height && !weight) {
          const itempropH = html.match(/itemprop="height"[^>]*>([^<]+)</);
          if (itempropH) height = itempropH[1].trim();
          const itempropW = html.match(/itemprop="weight"[^>]*>([^<]+)</);
          if (itempropW) {
            const wt = itempropW[1].trim().replace(/lb$/, '').trim();
            weight = `${wt} lbs`;
          }
        }

        if (height || weight) {
          const updateData: Record<string, string> = {};
          if (height) updateData.height = height;
          if (weight) updateData.weight = weight;
          await db.update(players).set(updateData).where(eq(players.id, player.id));
          result.updated++;
          console.log(`[Bio Scraper] Updated ${player.name}: ${height || 'no height'}, ${weight || 'no weight'}`);
        } else {
          result.skipped++;
        }

        await new Promise(r => setTimeout(r, 3500));
      } catch (err: any) {
        result.errors.push(`${player.name}: ${err.message}`);
        console.error(`[Bio Scraper] Error for ${player.name}:`, err.message);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    console.log(`[Bio Scraper] Done! Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`);
  } catch (err: any) {
    result.errors.push(`Fatal: ${err.message}`);
    console.error("[Bio Scraper] Fatal error:", err.message);
  } finally {
    bioScraperRunning = false;
  }

  return result;
}

const NBA_TEAM_MAP: Record<string, string> = {
  "ATL": "Atlanta Hawks", "BOS": "Boston Celtics", "BKN": "Brooklyn Nets",
  "BRK": "Brooklyn Nets", "CHA": "Charlotte Hornets", "CHO": "Charlotte Hornets",
  "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers",
  "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets", "DET": "Detroit Pistons",
  "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
  "LAC": "LA Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies",
  "MIA": "Miami Heat", "MIL": "Milwaukee Bucks", "MIN": "Minnesota Timberwolves",
  "NOP": "New Orleans Pelicans", "NYK": "New York Knicks", "OKC": "Oklahoma City Thunder",
  "ORL": "Orlando Magic", "PHI": "Philadelphia 76ers", "PHX": "Phoenix Suns",
  "PHO": "Phoenix Suns",
  "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs",
  "TOR": "Toronto Raptors", "UTA": "Utah Jazz", "WAS": "Washington Wizards",
  "NJN": "Brooklyn Nets", "NOH": "New Orleans Pelicans", "SEA": "Oklahoma City Thunder",
  "VAN": "Memphis Grizzlies", "CHH": "Charlotte Hornets", "WSB": "Washington Wizards",
};

function isMultiTeamAbbr(abbr: string): boolean {
  return /^\d+TM$/.test(abbr);
}

/** Returns the start year of the current NBA season (e.g. 2025 for 2025-26). NBA APIs use start year. */
export function getCurrentNBASeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 10) return year;   // Oct–Dec: current season is year-(year+1), start year = year
  return year - 1;                 // Jan–Sep: current season is (year-1)-year, start year = year-1
}

/** Format start year as "YYYY-YY" (e.g. 2025 → "2025-26"). */
export function seasonToDisplay(seasonStartYear: number): string {
  const endShort = String(seasonStartYear + 1).slice(-2);
  return `${seasonStartYear}-${endShort}`;
}

interface ScrapeResult {
  playersAdded: number;
  playersUpdated: number;
  statsUpdated: number;
  errors: string[];
  season: string;
  seasonsProcessed: string[];
}

/** Scrape all seasons from current back to this year (matches roster dropdown so every season has rosters). */
const OLDEST_SEASON_START = 1987;

async function fetchSeasonData(seasonYear: number): Promise<any[]> {
  let page = 1;
  let totalPages = 1;
  const allPlayerData: any[] = [];

  while (page <= totalPages) {
    const url = `https://api.server.nbaapi.com/api/playertotals?season=${seasonYear}&pageSize=100&page=${page}&isPlayoff=false`;
    console.log(`[NBA Scraper] Fetching season ${seasonYear} page ${page}...`);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`API returned ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    if (!json.data || !Array.isArray(json.data)) {
      throw new Error("Invalid API response format");
    }

    allPlayerData.push(...json.data);
    totalPages = json.pagination?.pages || 1;
    page++;

    if (page <= totalPages) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return allPlayerData;
}

export async function scrapeNBAPlayers(): Promise<ScrapeResult> {
  const currentSeasonYear = getCurrentNBASeason();
  const result: ScrapeResult = {
    playersAdded: 0,
    playersUpdated: 0,
    statsUpdated: 0,
    errors: [],
    season: seasonToDisplay(currentSeasonYear),
    seasonsProcessed: [],
  };

  const seasonYears: number[] = [];
  const current = getCurrentNBASeason();
  for (let y = current; y >= OLDEST_SEASON_START; y--) seasonYears.push(y);

  console.log(`[NBA Scraper] Starting scrape for ${seasonYears.length} seasons (${seasonToDisplay(current)} through ${seasonToDisplay(OLDEST_SEASON_START)})...`);

  const playerCache = new Map<string, number>();

  try {
    for (const seasonYear of seasonYears) {
      const seasonDisplay = seasonToDisplay(seasonYear);
      console.log(`[NBA Scraper] --- Processing season ${seasonDisplay} (API season=${seasonYear}) ---`);

      let allPlayerData: any[];
      try {
        allPlayerData = await fetchSeasonData(seasonYear);
      } catch (fetchErr: any) {
        result.errors.push(`Failed to fetch season ${seasonDisplay}: ${fetchErr.message}`);
        console.error(`[NBA Scraper] Failed to fetch season ${seasonDisplay}:`, fetchErr.message);
        continue;
      }

      console.log(`[NBA Scraper] Fetched ${allPlayerData.length} player records for ${seasonDisplay}`);
      result.seasonsProcessed.push(seasonDisplay);

      const playerEntriesMap: Record<string, any[]> = {};
      for (const p of allPlayerData) {
        const nameLower = p.playerName.toLowerCase();
        if (!playerEntriesMap[nameLower]) {
          playerEntriesMap[nameLower] = [];
        }
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

          const lastTeamEntry = teamEntries[teamEntries.length - 1];
          const currentTeamAbbr = lastTeamEntry.team;
          const currentTeamFull = isMultiTeamAbbr(currentTeamAbbr) ? currentTeamAbbr : (NBA_TEAM_MAP[currentTeamAbbr] || currentTeamAbbr);

          const position = firstEntry.position || "SF";
          const posMap: Record<string, string> = {
            "PG": "PG", "SG": "SG", "SF": "SF", "PF": "PF", "C": "C",
            "G": "PG", "F": "SF", "G-F": "SF", "F-G": "SG", "F-C": "PF", "C-F": "PF",
          };
          const mappedPos = posMap[position] || "SF";

          const defaultHeadshotUrl = "https://cdn.nba.com/headshots/nba/latest/1040x760/1631244.png";

          let birthDate: string | null = null;
          if (firstEntry.age) {
            const ageSeasonEnd = seasonYear;
            const birthYear = ageSeasonEnd - firstEntry.age;
            birthDate = `${birthYear}-01-01`;
          }

          let playerId = playerCache.get(nameLower);
          let playerWasJustCreated = false;

          if (!playerId) {
            const existingPlayers = await db.select().from(players).where(
              sql`LOWER(${players.name}) = ${nameLower}`
            );

            if (existingPlayers.length > 0) {
              playerId = existingPlayers[0].id;
              if (seasonYear === currentSeasonYear) {
                await db.update(players).set({
                  team: currentTeamFull,
                }).where(eq(players.id, playerId));
                result.playersUpdated++;
              }
            } else {
              const newPlayer = await storage.createPlayer({
                name: playerName,
                position: mappedPos,
                team: currentTeamFull,
                height: "6'0\"",
                weight: "200 lbs",
                jerseyNumber: 0,
                headshotUrl: defaultHeadshotUrl,
                bio: `${playerName} is a professional basketball player for the ${currentTeamFull}.`,
                profileViews: Math.floor(Math.random() * 6001) + 10000,
                hometown: null,
                birthDate: birthDate,
              });
              playerId = newPlayer.id;
              result.playersAdded++;
              playerWasJustCreated = true;
            }
            playerCache.set(nameLower, playerId);
          }

          const hadNbaStatsBefore = await storage.getPlayerHasNbaStats(playerId);
          const existingSeasonStats = await db.select().from(playerStats).where(
            and(
              eq(playerStats.playerId, playerId),
              sql`CAST(${playerStats.season} AS text) = ${seasonDisplay}`,
              eq(playerStats.league, "NBA")
            )
          );

          if (hasMultiTeam && individualEntries.length > 1) {
            for (const oldStat of existingSeasonStats) {
              await db.delete(playerStats).where(eq(playerStats.id, oldStat.id));
            }

            for (const te of individualEntries) {
              const teTeamFull = NBA_TEAM_MAP[te.team] || te.team;
              const teGP = te.games || 0;
              if (teGP === 0) continue;

              await storage.createPlayerStats({
                playerId: playerId,
                season: seasonDisplay,
                team: teTeamFull,
                league: "NBA",
                gamesPlayed: teGP,
                pointsPerGame: (te.points / teGP).toFixed(1),
                reboundsPerGame: (te.totalRb / teGP).toFixed(1),
                assistsPerGame: (te.assists / teGP).toFixed(1),
                stealsPerGame: (te.steals / teGP).toFixed(1),
                blocksPerGame: (te.blocks / teGP).toFixed(1),
                fieldGoalPct: te.fieldPercent ? (te.fieldPercent * 100).toFixed(1) : "0.0",
              });
              result.statsUpdated++;
            }
          } else {
            const te = teamEntries[0];
            const teTeamFull = isMultiTeamAbbr(te.team) ? te.team : (NBA_TEAM_MAP[te.team] || te.team);
            const teGP = te.games || 0;
            if (teGP === 0) continue;

            if (existingSeasonStats.length > 0) {
              await db.update(playerStats).set({
                team: teTeamFull,
                gamesPlayed: teGP,
                pointsPerGame: (te.points / teGP).toFixed(1),
                reboundsPerGame: (te.totalRb / teGP).toFixed(1),
                assistsPerGame: (te.assists / teGP).toFixed(1),
                stealsPerGame: (te.steals / teGP).toFixed(1),
                blocksPerGame: (te.blocks / teGP).toFixed(1),
                fieldGoalPct: te.fieldPercent ? (te.fieldPercent * 100).toFixed(1) : "0.0",
              }).where(eq(playerStats.id, existingSeasonStats[0].id));
            } else {
              await storage.createPlayerStats({
                playerId: playerId,
                season: seasonDisplay,
                team: teTeamFull,
                league: "NBA",
                gamesPlayed: teGP,
                pointsPerGame: (te.points / teGP).toFixed(1),
                reboundsPerGame: (te.totalRb / teGP).toFixed(1),
                assistsPerGame: (te.assists / teGP).toFixed(1),
                stealsPerGame: (te.steals / teGP).toFixed(1),
                blocksPerGame: (te.blocks / teGP).toFixed(1),
                fieldGoalPct: te.fieldPercent ? (te.fieldPercent * 100).toFixed(1) : "0.0",
              });
            }
            result.statsUpdated++;
          }
          if (!hadNbaStatsBefore && !playerWasJustCreated) {
            await storage.addNbaProfileViewsBoost(playerId);
          }
        } catch (playerErr: any) {
          result.errors.push(`Error processing ${nameLower} (${seasonDisplay}): ${playerErr.message}`);
          console.error(`[NBA Scraper] Error processing ${nameLower}:`, playerErr.message);
        }
      }

      console.log(`[NBA Scraper] Season ${seasonDisplay} done. Running totals - Added: ${result.playersAdded}, Updated: ${result.playersUpdated}, Stats: ${result.statsUpdated}`);

      await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`[NBA Scraper] All ${seasonYears.length} seasons complete! Added: ${result.playersAdded}, Updated: ${result.playersUpdated}, Stats: ${result.statsUpdated}`);
  } catch (err: any) {
    result.errors.push(`Scraper error: ${err.message}`);
    console.error("[NBA Scraper] Fatal error:", err.message);
  }

  return result;
}
