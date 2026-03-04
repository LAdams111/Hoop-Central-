/**
 * Job: run NBA scraper (canonical pipeline) then sync to frontend tables.
 */
import { scrapeNBAPlayers, type NbaScraperResult } from "../scrapers/nbaScraper";

export async function jobScrapeNba(options: { runSyncAfter?: boolean } = {}): Promise<NbaScraperResult> {
  return scrapeNBAPlayers({ runSyncAfter: true, ...options });
}
