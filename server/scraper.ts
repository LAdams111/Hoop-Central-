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
  "CHA": "Charlotte Hornets", "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers",
  "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets", "DET": "Detroit Pistons",
  "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
  "LAC": "LA Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies",
  "MIA": "Miami Heat", "MIL": "Milwaukee Bucks", "MIN": "Minnesota Timberwolves",
  "NOP": "New Orleans Pelicans", "NYK": "New York Knicks", "OKC": "Oklahoma City Thunder",
  "ORL": "Orlando Magic", "PHI": "Philadelphia 76ers", "PHX": "Phoenix Suns",
  "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs",
  "TOR": "Toronto Raptors", "UTA": "Utah Jazz", "WAS": "Washington Wizards",
  "NJN": "Brooklyn Nets", "NOH": "New Orleans Pelicans", "SEA": "Oklahoma City Thunder",
  "VAN": "Memphis Grizzlies", "CHH": "Charlotte Hornets", "WSB": "Washington Wizards",
};

function getCurrentNBASeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 10) return year + 1;
  return year;
}

function seasonToDisplay(seasonYear: number): string {
  const startYear = seasonYear - 1;
  const endShort = seasonYear.toString().slice(-2);
  return `${startYear}-${endShort}`;
}

interface ScrapeResult {
  playersAdded: number;
  playersUpdated: number;
  statsUpdated: number;
  errors: string[];
  season: string;
}

export async function scrapeNBAPlayers(): Promise<ScrapeResult> {
  const seasonYear = getCurrentNBASeason();
  const seasonDisplay = seasonToDisplay(seasonYear);
  const result: ScrapeResult = { playersAdded: 0, playersUpdated: 0, statsUpdated: 0, errors: [], season: seasonDisplay };

  console.log(`[NBA Scraper] Starting scrape for season ${seasonDisplay} (API season=${seasonYear})...`);

  try {
    let page = 1;
    let totalPages = 1;
    const allPlayerData: any[] = [];

    while (page <= totalPages) {
      const url = `https://api.server.nbaapi.com/api/playertotals?season=${seasonYear}&pageSize=100&page=${page}&isPlayoff=false`;
      console.log(`[NBA Scraper] Fetching page ${page}...`);

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

    console.log(`[NBA Scraper] Fetched ${allPlayerData.length} player records`);

    for (const p of allPlayerData) {
      try {
        const playerName = p.playerName;
        const teamAbbr = p.team;
        const teamFull = NBA_TEAM_MAP[teamAbbr] || teamAbbr;
        const gamesPlayed = p.games || 0;

        if (gamesPlayed === 0) continue;

        const ppg = (p.points / gamesPlayed).toFixed(1);
        const rpg = (p.totalRb / gamesPlayed).toFixed(1);
        const apg = (p.assists / gamesPlayed).toFixed(1);
        const spg = (p.steals / gamesPlayed).toFixed(1);
        const bpg = (p.blocks / gamesPlayed).toFixed(1);
        const fgPct = p.fieldPercent ? (p.fieldPercent * 100).toFixed(1) : "0.0";

        const position = p.position || "SF";
        const posMap: Record<string, string> = {
          "PG": "PG", "SG": "SG", "SF": "SF", "PF": "PF", "C": "C",
          "G": "PG", "F": "SF", "G-F": "SF", "F-G": "SG", "F-C": "PF", "C-F": "PF",
        };
        const mappedPos = posMap[position] || "SF";

        const defaultHeadshotUrl = "https://cdn.nba.com/headshots/nba/latest/1040x760/1631244.png";

        let birthDate: string | null = null;
        if (p.age) {
          const now = new Date();
          const birthYear = now.getFullYear() - p.age;
          birthDate = `${birthYear}-01-01`;
        }

        const existingPlayers = await db.select().from(players).where(
          sql`LOWER(${players.name}) = ${playerName.toLowerCase()}`
        );

        let playerId: number;

        if (existingPlayers.length > 0) {
          playerId = existingPlayers[0].id;
          await db.update(players).set({
            team: teamFull,
          }).where(eq(players.id, playerId));
          result.playersUpdated++;
        } else {
          const newPlayer = await storage.createPlayer({
            name: playerName,
            position: mappedPos,
            team: teamFull,
            height: "6'0\"",
            weight: "200 lbs",
            jerseyNumber: 0,
            headshotUrl: defaultHeadshotUrl,
            bio: `${playerName} is a professional basketball player for the ${teamFull}.`,
            profileViews: 50,
            hometown: null,
            birthDate: birthDate,
          });
          playerId = newPlayer.id;
          result.playersAdded++;
        }

        const existingStats = await db.select().from(playerStats).where(
          and(
            eq(playerStats.playerId, playerId),
            eq(playerStats.season, seasonDisplay),
            eq(playerStats.league, "NBA")
          )
        );

        if (existingStats.length > 0) {
          await db.update(playerStats).set({
            team: teamFull,
            gamesPlayed: gamesPlayed,
            pointsPerGame: ppg,
            reboundsPerGame: rpg,
            assistsPerGame: apg,
            stealsPerGame: spg,
            blocksPerGame: bpg,
            fieldGoalPct: fgPct,
          }).where(eq(playerStats.id, existingStats[0].id));
        } else {
          await storage.createPlayerStats({
            playerId: playerId,
            season: seasonDisplay,
            team: teamFull,
            league: "NBA",
            gamesPlayed: gamesPlayed,
            pointsPerGame: ppg,
            reboundsPerGame: rpg,
            assistsPerGame: apg,
            stealsPerGame: spg,
            blocksPerGame: bpg,
            fieldGoalPct: fgPct,
          });
        }

        result.statsUpdated++;
      } catch (playerErr: any) {
        result.errors.push(`Error processing ${p.playerName}: ${playerErr.message}`);
        console.error(`[NBA Scraper] Error processing ${p.playerName}:`, playerErr.message);
      }
    }

    console.log(`[NBA Scraper] Complete! Added: ${result.playersAdded}, Updated: ${result.playersUpdated}, Stats: ${result.statsUpdated}`);
  } catch (err: any) {
    result.errors.push(`Scraper error: ${err.message}`);
    console.error("[NBA Scraper] Fatal error:", err.message);
  }

  return result;
}
