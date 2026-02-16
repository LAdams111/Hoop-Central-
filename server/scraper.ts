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

function lbsToLbs(lbs: number): string {
  return `${Math.round(lbs)} lbs`;
}

function normalizeName(name: string): string {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function nameVariants(name: string): string[] {
  const normalized = normalizeName(name);
  const variants = [normalized];

  const noSuffix = normalized.replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, "").trim();
  if (noSuffix !== normalized) variants.push(noSuffix);

  const noDots = normalized.replace(/\./g, "");
  if (noDots !== normalized) variants.push(noDots);

  const noHyphen = normalized.replace(/-/g, " ");
  if (noHyphen !== normalized) variants.push(noHyphen);

  return Array.from(new Set(variants));
}

function lookupBio(bioMap: Map<string, WikidataBio>, playerName: string): WikidataBio | undefined {
  const variants = nameVariants(playerName);
  for (const v of variants) {
    const match = bioMap.get(v);
    if (match) return match;
  }
  return undefined;
}

async function fetchWikidataBios(): Promise<Map<string, WikidataBio>> {
  const bioMap = new Map<string, WikidataBio>();

  const query = `SELECT DISTINCT ?playerLabel 
    (SAMPLE(?h) AS ?height) (SAMPLE(?w) AS ?weight) (SAMPLE(?wUnit) AS ?weightUnit)
    (SAMPLE(?d) AS ?dob) (SAMPLE(?j) AS ?jerseyNumber) 
    WHERE { 
      ?player wdt:P106 wd:Q3665646 . 
      ?player wdt:P118 wd:Q155223 . 
      OPTIONAL { ?player wdt:P2048 ?h } 
      OPTIONAL { ?player p:P2067 ?wStmt . ?wStmt psv:P2067 ?wNode . ?wNode wikibase:quantityAmount ?w . ?wNode wikibase:quantityUnit ?wUnit } 
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
      const weightRaw = b.weight?.value ? parseFloat(b.weight.value) : null;
      const weightUnit = b.weightUnit?.value || "";
      const isLbs = weightUnit.includes("Q100995");
      const weightVal = weightRaw ? (isLbs ? lbsToLbs(weightRaw) : kgToLbs(weightRaw)) : null;
      const dob = b.dob?.value ? b.dob.value.split("T")[0] : null;
      const jersey = b.jerseyNumber?.value ? parseInt(b.jerseyNumber.value) : null;

      const bio: WikidataBio = {
        height: heightCm ? cmToFeetInches(heightCm) : "6'0\"",
        weight: weightVal || "200 lbs",
        dob,
        jerseyNumber: jersey,
      };

      const normalized = normalizeName(name);
      bioMap.set(normalized, bio);

      const noSuffix = normalized.replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, "").trim();
      if (noSuffix !== normalized && !bioMap.has(noSuffix)) {
        bioMap.set(noSuffix, bio);
      }
    }

    console.log(`[Wikidata] Mapped ${bioMap.size} unique name entries`);
  } catch (err: any) {
    console.error("[Wikidata] Error fetching bios:", err.message);
  }

  return bioMap;
}

async function fetchWikidataEntityBio(playerName: string): Promise<WikidataBio | null> {
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(playerName)}&language=en&format=json&limit=10`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": "HoopCentral/1.0" },
    });
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const results = searchData.search || [];

    const basketballPlayer = results.find((r: any) => {
      const desc = (r.description || "").toLowerCase();
      return desc.includes("basketball") || desc.includes("nba");
    });

    if (!basketballPlayer) return null;

    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${basketballPlayer.id}&props=claims&format=json`;
    const entityRes = await fetch(entityUrl, {
      headers: { "User-Agent": "HoopCentral/1.0" },
    });
    if (!entityRes.ok) return null;

    const entityData = await entityRes.json();
    const claims = entityData.entities?.[basketballPlayer.id]?.claims;
    if (!claims) return null;

    const heightRaw = claims.P2048?.[0]?.mainsnak?.datavalue?.value?.amount;
    const weightRaw = claims.P2067?.[0]?.mainsnak?.datavalue?.value?.amount;
    const weightUnitId = claims.P2067?.[0]?.mainsnak?.datavalue?.value?.unit || "";
    const dobRaw = claims.P569?.[0]?.mainsnak?.datavalue?.value?.time;
    const jerseyRaw = claims.P1618?.[0]?.mainsnak?.datavalue?.value;

    const heightCm = heightRaw ? parseFloat(heightRaw) : null;
    const weightNum = weightRaw ? parseFloat(weightRaw) : null;
    const isWeightLbs = weightUnitId.includes("Q100995");

    const height = heightCm ? cmToFeetInches(heightCm < 3 ? heightCm * 100 : heightCm) : null;
    const weight = weightNum ? (isWeightLbs ? lbsToLbs(weightNum) : kgToLbs(weightNum)) : null;
    const dob = dobRaw ? dobRaw.replace(/^\+/, "").split("T")[0] : null;
    const jersey = jerseyRaw ? parseInt(jerseyRaw) : null;

    if (!height && !weight && !dob) return null;

    return {
      height: height || "6'0\"",
      weight: weight || "200 lbs",
      dob,
      jerseyNumber: jersey,
    };
  } catch {
    return null;
  }
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
  bioMatches: number;
  wikiFallbacks: number;
  seasonsScraped: number;
  errors: string[];
  season: string;
}

const posMap: Record<string, string> = {
  "PG": "PG", "SG": "SG", "SF": "SF", "PF": "PF", "C": "C",
  "G": "PG", "F": "SF", "G-F": "SF", "F-G": "SG", "F-C": "PF", "C-F": "PF",
};

async function fetchSeasonData(seasonYear: number): Promise<any[]> {
  let page = 1;
  let totalPages = 1;
  const allData: any[] = [];

  while (page <= totalPages) {
    const url = `https://api.server.nbaapi.com/api/playertotals?season=${seasonYear}&pageSize=100&page=${page}&isPlayoff=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API returned ${res.status} for season ${seasonYear}`);

    const json = await res.json();
    if (!json.data || !Array.isArray(json.data)) break;

    allData.push(...json.data);
    totalPages = json.pagination?.pages || 1;
    page++;

    if (page <= totalPages) await new Promise(r => setTimeout(r, 300));
  }

  return allData;
}

export async function scrapeNBAPlayers(options?: { fullHistory?: boolean }): Promise<ScrapeResult> {
  const currentSeasonYear = getCurrentNBASeason();
  const currentSeasonDisplay = seasonToDisplay(currentSeasonYear);
  const result: ScrapeResult = {
    playersAdded: 0, playersUpdated: 0, statsUpdated: 0,
    bioMatches: 0, wikiFallbacks: 0, seasonsScraped: 0,
    errors: [], season: currentSeasonDisplay,
  };

  const fullHistory = options?.fullHistory ?? false;
  const seasonsToFetch: number[] = [];

  if (fullHistory) {
    for (let yr = currentSeasonYear; yr >= 2003; yr--) {
      seasonsToFetch.push(yr);
    }
  } else {
    seasonsToFetch.push(currentSeasonYear);
  }

  console.log(`[NBA Scraper] Starting scrape. Seasons: ${seasonsToFetch.length}, Full history: ${fullHistory}`);

  try {
    const wikiBios = await fetchWikidataBios();

    const unmatchedNames: string[] = [];
    const processedPlayerIds = new Set<number>();

    for (const seasonYear of seasonsToFetch) {
      const seasonDisplay = seasonToDisplay(seasonYear);
      console.log(`[NBA Scraper] Fetching season ${seasonDisplay}...`);

      let seasonData: any[];
      try {
        seasonData = await fetchSeasonData(seasonYear);
      } catch (err: any) {
        console.error(`[NBA Scraper] Failed to fetch season ${seasonDisplay}: ${err.message}`);
        result.errors.push(`Season ${seasonDisplay}: ${err.message}`);
        continue;
      }

      if (seasonData.length === 0) {
        console.log(`[NBA Scraper] No data for season ${seasonDisplay}, skipping`);
        continue;
      }

      console.log(`[NBA Scraper] Season ${seasonDisplay}: ${seasonData.length} records`);
      result.seasonsScraped++;

      for (const p of seasonData) {
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
          const mappedPos = posMap[position] || "SF";
          const defaultHeadshotUrl = "https://cdn.nba.com/headshots/nba/latest/1040x760/1631244.png";

          let bio = lookupBio(wikiBios, playerName);

          const existingPlayers = await db.select().from(players).where(
            sql`LOWER(${players.name}) = ${playerName.toLowerCase()}`
          );

          let playerId: number;
          const isCurrentSeason = seasonYear === currentSeasonYear;

          if (existingPlayers.length > 0) {
            playerId = existingPlayers[0].id;

            if (isCurrentSeason) {
              const existing = existingPlayers[0];
              const updates: Record<string, any> = { team: teamFull };

              if (!bio && !processedPlayerIds.has(playerId) && 
                  (existing.height === "6'0\"" || existing.weight === "200 lbs" || existing.jerseyNumber === 0 || 
                   !existing.birthDate || existing.birthDate.endsWith("-01-01"))) {
                unmatchedNames.push(playerName);
              }

              if (bio) {
                if (existing.height === "6'0\"") updates.height = bio.height;
                if (existing.weight === "200 lbs") updates.weight = bio.weight;
                if (existing.jerseyNumber === 0 && bio.jerseyNumber && bio.jerseyNumber > 0) updates.jerseyNumber = bio.jerseyNumber;
                if (bio.dob && (!existing.birthDate || existing.birthDate.endsWith("-01-01"))) updates.birthDate = bio.dob;
                if (!processedPlayerIds.has(playerId)) result.bioMatches++;
              }

              await db.update(players).set(updates).where(eq(players.id, playerId));
              if (!processedPlayerIds.has(playerId)) result.playersUpdated++;
            }
          } else {
            let birthDate: string | null = bio?.dob || null;
            if (!birthDate && p.age) {
              const now = new Date();
              const birthYear = now.getFullYear() - p.age;
              birthDate = `${birthYear}-01-01`;
            }

            if (!bio) {
              unmatchedNames.push(playerName);
            }

            const newPlayer = await storage.createPlayer({
              name: playerName,
              position: mappedPos,
              team: teamFull,
              height: bio?.height || "6'0\"",
              weight: bio?.weight || "200 lbs",
              jerseyNumber: bio?.jerseyNumber || 0,
              headshotUrl: defaultHeadshotUrl,
              bio: `${playerName} is a professional basketball player for the ${teamFull}.`,
              profileViews: 50,
              hometown: null,
              birthDate: birthDate,
            });
            playerId = newPlayer.id;
            if (!bio) {
            } else {
              result.bioMatches++;
            }
            result.playersAdded++;
          }

          processedPlayerIds.add(playerId);

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

      if (seasonsToFetch.length > 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const uniqueUnmatched = Array.from(new Set(unmatchedNames));
    if (uniqueUnmatched.length > 0) {
      console.log(`[NBA Scraper] Looking up ${uniqueUnmatched.length} unmatched players via Wikidata entity search...`);
      let wikiCount = 0;
      const batchSize = 5;

      for (let i = 0; i < uniqueUnmatched.length; i += batchSize) {
        const batch = uniqueUnmatched.slice(i, i + batchSize);
        const lookups = batch.map(async (name) => {
          try {
            const wikiBio = await fetchWikidataEntityBio(name);
            if (wikiBio) {
              const existingRows = await db.select().from(players).where(
                sql`LOWER(${players.name}) = ${name.toLowerCase()}`
              );
              if (existingRows.length > 0) {
                const existing = existingRows[0];
                const updates: Record<string, any> = {};
                if (existing.height === "6'0\"" && wikiBio.height && wikiBio.height !== "6'0\"") updates.height = wikiBio.height;
                if (existing.weight === "200 lbs" && wikiBio.weight && wikiBio.weight !== "200 lbs") updates.weight = wikiBio.weight;
                if (existing.jerseyNumber === 0 && wikiBio.jerseyNumber && wikiBio.jerseyNumber > 0) updates.jerseyNumber = wikiBio.jerseyNumber;
                if (wikiBio.dob && (!existing.birthDate || existing.birthDate.endsWith("-01-01"))) updates.birthDate = wikiBio.dob;
                if (Object.keys(updates).length > 0) {
                  await db.update(players).set(updates).where(eq(players.id, existing.id));
                  wikiCount++;
                }
              }
            }
          } catch (err: any) {
            console.error(`[Wikidata Entity] Failed for ${name}: ${err.message}`);
          }
        });
        await Promise.all(lookups);
        await new Promise(r => setTimeout(r, 500));
      }

      result.wikiFallbacks = wikiCount;
      console.log(`[NBA Scraper] Wikidata entity search enriched ${wikiCount} additional players`);
    }

    console.log(`[NBA Scraper] Complete! Added: ${result.playersAdded}, Updated: ${result.playersUpdated}, Stats: ${result.statsUpdated}, Bio: ${result.bioMatches}, Wiki: ${result.wikiFallbacks}, Seasons: ${result.seasonsScraped}`);
  } catch (err: any) {
    result.errors.push(`Scraper error: ${err.message}`);
    console.error("[NBA Scraper] Fatal error:", err.message);
  }

  return result;
}
