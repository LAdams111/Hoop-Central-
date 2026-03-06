import { storage } from "./storage";
import { db } from "./db";
import { players, playerExternalIds } from "@shared/canonicalSchema";
import { eq, and } from "drizzle-orm";
import { parseHeightToCm, parseWeightToKg } from "./services/playerService";
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

/** Update height_cm / weight_kg for canonical players (NBA) that have missing or default bio data. */
export async function updatePlayerBios(): Promise<BioUpdateResult> {
  if (bioScraperRunning) throw new Error("Bio scraper already running");
  bioScraperRunning = true;
  const result: BioUpdateResult = { updated: 0, skipped: 0, errors: [], total: 0 };

  try {
    const nbaPlayersWithExtId = await db
      .select({ player: players, externalId: playerExternalIds.externalId })
      .from(players)
      .innerJoin(playerExternalIds, eq(playerExternalIds.playerId, players.id))
      .where(eq(playerExternalIds.source, "nba"));
    const toUpdate = nbaPlayersWithExtId.filter(
      (r) => r.player.heightCm == null || r.player.weightKg == null
    );
    result.total = toUpdate.length;
    console.log(`[Bio Scraper] Found ${toUpdate.length} NBA players with missing height/weight`);

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

    for (const { player, externalId } of toUpdate) {
      try {
        const apiEntry = apiPlayerMap.get(player.fullName.toLowerCase());
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

        let heightStr: string | null = null;
        let weightStr: string | null = null;

        const heightJsonMatch = html.match(/\"height\"\s*:\s*\{\s*\"@type\"\s*:\s*\"QuantitativeValue\"\s*,\s*\"value\"\s*:\s*\"([^\"]+)\"/);
        if (heightJsonMatch) {
          const raw = heightJsonMatch[1].trim();
          const parts = raw.match(/^(\d+)-(\d+)$/);
          if (parts) {
            heightStr = `${parts[1]}'${parts[2]}"`;
          } else {
            heightStr = raw;
          }
        }

        const weightJsonMatch = html.match(/\"weight\"\s*:\s*\{\s*\"@type\"\s*:\s*\"QuantitativeValue\"\s*,\s*\"value\"\s*:\s*\"([^\"]+)\"/);
        if (weightJsonMatch) {
          const raw = weightJsonMatch[1].trim();
          weightStr = raw.includes("lbs") ? raw : `${raw} lbs`;
        }

        if (!heightStr && !weightStr) {
          const itempropH = html.match(/itemprop="height"[^>]*>([^<]+)</);
          if (itempropH) heightStr = itempropH[1].trim();
          const itempropW = html.match(/itemprop="weight"[^>]*>([^<]+)</);
          if (itempropW) {
            const wt = itempropW[1].trim().replace(/lb$/, '').trim();
            weightStr = `${wt} lbs`;
          }
        }

        const heightCm = parseHeightToCm(heightStr);
        const weightKg = parseWeightToKg(weightStr);
        if (heightCm != null || weightKg != null) {
          const updateData: { heightCm?: number; weightKg?: number } = {};
          if (heightCm != null) updateData.heightCm = heightCm;
          if (weightKg != null) updateData.weightKg = weightKg;
          await db.update(players).set(updateData).where(eq(players.id, player.id));
          result.updated++;
          console.log(`[Bio Scraper] Updated ${player.fullName}: ${heightCm ?? "—"} cm, ${weightKg ?? "—"} kg`);
        } else {
          result.skipped++;
        }

        await new Promise(r => setTimeout(r, 3500));
      } catch (err: any) {
        result.errors.push(`${player.fullName}: ${err.message}`);
        console.error(`[Bio Scraper] Error for ${player.fullName}:`, err.message);
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

/** Scrape NBA players into canonical tables (players, player_seasons, player_season_stats). */
export async function scrapeNBAPlayers(): Promise<import("./scrapers/nbaScraper").NbaScraperResult> {
  const { scrapeNBAPlayers: runNba } = await import("./scrapers/nbaScraper");
  return runNba({ runSyncAfter: false });
}
