/**
 * Job: run NCAA scraper (canonical pipeline) then optionally sync to frontend tables.
 */
import { runNcaaScraper, type NcaaScraperOptions, type NcaaScraperResult } from "../scrapers/ncaaScraper";

export async function jobScrapeNcaa(options: NcaaScraperOptions = {}): Promise<NcaaScraperResult> {
  return runNcaaScraper({ runSyncAfter: true, ...options });
}
