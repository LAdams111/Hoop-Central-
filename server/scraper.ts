import { storage } from "./storage";
import { db } from "./db";
import { players, playerStats } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

interface WikidataBio {
  height: string;
  weight: string;
  dob: string | null;
  jerseyNumber: number | null;
}

function cmToFeetInches(cm: number): string {
  const totalInches = cm / 2.54;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches % 12);
  if (inches === 12) {
    feet++;
    inches = 0;
  }
  return `${feet}'${inches}"`;
}

function kgToLbs(kg: number): string {
  return `${Math.round(kg * 2.20462)} lbs`;
}

async function fetchWikidataBios(): Promise<Map<string, WikidataBio>> {
  const bioMap = new Map<string, WikidataBio>();

  const query = `SELECT DISTINCT ?playerLabel 
    (SAMPLE(?h) AS ?height) (SAMPLE(?w) AS ?weight) 
    (SAMPLE(?d) AS ?dob) (SAMPLE(?j) AS ?jerseyNumber) 
    WHERE { 
      ?player wdt:P106 wd:Q3665646 . 
      ?player wdt:P118 wd:Q155223 . 
      OPTIONAL { ?player wdt:P2048 ?h } 
      OPTIONAL { ?player wdt:P2067 ?w } 
      OPTIONAL { ?player wdt:P569 ?d } 
      OPTIONAL { ?player wdt:P1618 ?j } 
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" } 
    } GROUP BY ?playerLabel LIMIT 3000`;

  try {
    console.log("[Wikidata] Fetching player bio data...");
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "HoopCentral/1.0" },
    });

    if (!res.ok) {
      console.error(`[Wikidata] API returned ${res.status}`);
      return bioMap;
    }

    const json = await res.json();
    const bindings = json.results?.bindings || [];
    console.log(`[Wikidata] Got ${bindings.length} player records`);

    for (const b of bindings) {
      const name = b.playerLabel?.value;
      if (!name) continue;

      const heightCm = b.height?.value ? parseFloat(b.height.value) : null;
      const weightKg = b.weight?.value ? parseFloat(b.weight.value) : null;
      const dob = b.dob?.value ? b.dob.value.split("T")[0] : null;
      const jersey = b.jerseyNumber?.value ? parseInt(b.jerseyNumber.value) : null;

      bioMap.set(name.toLowerCase(), {
        height: heightCm ? cmToFeetInches(heightCm) : "6'0\"",
        weight: weightKg ? kgToLbs(weightKg) : "200 lbs",
        dob,
        jerseyNumber: jersey,
      });
    }

    console.log(`[Wikidata] Mapped ${bioMap.size} unique players`);
  } catch (err: any) {
    console.error("[Wikidata] Error fetching bios:", err.message);
  }

  return bioMap;
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
    const wikiBios = await fetchWikidataBios();

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

    let bioMatches = 0;

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

        const bio = wikiBios.get(playerName.toLowerCase());
        if (bio) bioMatches++;

        const playerHeight = bio?.height || "6'0\"";
        const playerWeight = bio?.weight || "200 lbs";
        const jerseyNumber = bio?.jerseyNumber || 0;

        let birthDate: string | null = bio?.dob || null;
        if (!birthDate && p.age) {
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
          const existing = existingPlayers[0];
          const updates: Record<string, any> = { team: teamFull };
          if (bio) {
            if (existing.height === "6'0\"") updates.height = playerHeight;
            if (existing.weight === "200 lbs") updates.weight = playerWeight;
            if (existing.jerseyNumber === 0 && jerseyNumber > 0) updates.jerseyNumber = jerseyNumber;
            if (!existing.birthDate && birthDate) updates.birthDate = birthDate;
          }
          await db.update(players).set(updates).where(eq(players.id, playerId));
          result.playersUpdated++;
        } else {
          const newPlayer = await storage.createPlayer({
            name: playerName,
            position: mappedPos,
            team: teamFull,
            height: playerHeight,
            weight: playerWeight,
            jerseyNumber: jerseyNumber,
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

    console.log(`[NBA Scraper] Complete! Added: ${result.playersAdded}, Updated: ${result.playersUpdated}, Stats: ${result.statsUpdated}, Bio matches: ${bioMatches}`);
  } catch (err: any) {
    result.errors.push(`Scraper error: ${err.message}`);
    console.error("[NBA Scraper] Fatal error:", err.message);
  }

  return result;
}
