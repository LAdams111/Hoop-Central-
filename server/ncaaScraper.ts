/**
 * NCAA scraper entry point. All logic lives in server/ncaa/ (modular scraper).
 * Re-exports for routes and scheduler so they keep using "./ncaaScraper".
 */

export {
  runNcaaScraper,
  isNcaaScraperRunning,
  getLastNcaaScraperResult,
  testFetchOnePage,
  importNcaaPlayerSeasons,
  importNcaaRosterHtml,
  type NcaaScraperOptions,
  type NcaaScraperResult,
  type NcaaImportRow,
  type NcaaImportResult,
} from "./ncaa/scraper";
