import { storage } from "./storage";
import { db } from "./db";
import { players } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { getCurrentNBASeason as getNbaSeason, seasonToDisplay as nbaSeasonToDisplay } from "./scrapers/nbaScraper";

export const getCurrentNBASeason = getNbaSeason;
export const seasonToDisplay = nbaSeasonToDisplay;

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

/** Scrape NBA players into canonical tables then sync to frontend. */
export async function scrapeNBAPlayers(): Promise<import("./scrapers/nbaScraper").NbaScraperResult> {
  const { scrapeNBAPlayers: runNba } = await import("./scrapers/nbaScraper");
  return runNba({ runSyncAfter: true });
}
