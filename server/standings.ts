/**
 * Fetches current NBA season standings from stats.nba.com and upserts into team_records
 * so the roster page and elsewhere show up-to-date W-L for the current season.
 */

import { getCurrentNBASeason, seasonToDisplay } from "./scraper";
import { storage } from "./storage";

/** Return current NBA season string (e.g. "2025-26") for use by routes. */
export function getCurrentSeasonForStandings(): string {
  return seasonToDisplay(getCurrentNBASeason());
}

/** Season start years we fetch standings for: current back through 1999-2000, plus earlier back to 1987-88 (matches roster dropdown). */
const STANDINGS_SEASON_YEARS = (() => {
  const start = getCurrentNBASeason();
  const oldest = 1987;
  const years: number[] = [];
  for (let y = start; y >= oldest; y--) years.push(y);
  return years;
})();

export function getStandingsSeasonStrings(): string[] {
  return STANDINGS_SEASON_YEARS.map((y) => seasonToDisplay(y));
}

/** NBA stats API returns "City Name" (e.g. "Los Angeles") + " TeamName" (e.g. "Clippers").
 * We store canonical names; map API combo to our value when different. */
const API_TEAM_NAME_TO_CANONICAL: Record<string, string> = {
  "Los Angeles Clippers": "LA Clippers",
  "New York Knicks": "New York Knicks",
  "Philadelphia 76ers": "Philadelphia 76ers",
  "Philadelphia Sixers": "Philadelphia 76ers",
};

function canonicalTeamName(teamCity: string, teamName: string): string {
  const combined = `${(teamCity || "").trim()} ${(teamName || "").trim()}`.trim();
  return API_TEAM_NAME_TO_CANONICAL[combined] || combined;
}

export interface StandingsUpdateResult {
  season: string;
  updated: number;
  inserted: number;
  errors: string[];
}

/**
 * Fetch standings for a single season from stats.nba.com and upsert into team_records.
 * Works for any season (e.g. "2024-25", "2020-21"). Used for both current and historical.
 */
export async function fetchStandingsForSeason(season: string): Promise<StandingsUpdateResult> {
  const result: StandingsUpdateResult = { season, updated: 0, inserted: 0, errors: [] };

  const baseUrl = "https://stats.nba.com/stats/leaguestandingsv3";
  const url = new URL(process.env.NBA_STANDINGS_URL || baseUrl);
  if (url.toString() === baseUrl) {
    url.searchParams.set("LeagueID", "00");
    url.searchParams.set("Season", season);
    url.searchParams.set("SeasonType", "Regular Season");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://www.nba.com/",
    Origin: "https://www.nba.com",
  };

  let res: Response | null = null;
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      res = await fetch(url.toString(), { headers });
      break;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Fetch failed (attempt ${attempt}/${maxAttempts}): ${msg}`);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      continue;
    }
  }

  if (!res || !res.ok) {
    if (result.errors.length === 0) result.errors.push(`API returned ${res?.status ?? "?"}: ${res?.statusText ?? "no response"}`);
    return result;
  }

  let data: { resultSets?: { headers: string[]; rowSet: unknown[][] }[] };
  try {
    data = await res.json();
  } catch {
    result.errors.push("Invalid JSON response");
    return result;
  }

  const resultSets = data?.resultSets;
  if (!Array.isArray(resultSets) || resultSets.length === 0) {
    result.errors.push("No resultSets in response");
    return result;
  }

  const rs = resultSets[0];
  const columnNames: string[] = Array.isArray(rs.headers) ? rs.headers : [];
  const rowSet: unknown[][] = Array.isArray(rs.rowSet) ? rs.rowSet : [];

  const idxTeamCity = columnNames.findIndex((h) => h === "TeamCity" || h === "TEAM_CITY");
  const idxTeamName = columnNames.findIndex((h) => h === "TeamName" || h === "TEAM_NAME");
  const idxW = columnNames.findIndex((h) => h === "W" || h === "WINS");
  const idxL = columnNames.findIndex((h) => h === "L" || h === "LOSSES");

  if (idxTeamCity === -1 || idxTeamName === -1 || idxW === -1 || idxL === -1) {
    result.errors.push(`Missing columns: headers=${JSON.stringify(columnNames)}`);
    return result;
  }

  for (const row of rowSet) {
    const teamCity = String(row[idxTeamCity] ?? "").trim();
    const teamName = String(row[idxTeamName] ?? "").trim();
    const w = parseInt(String(row[idxW] ?? "0"), 10);
    const l = parseInt(String(row[idxL] ?? "0"), 10);
    if (!teamCity && !teamName) continue;

    const team = canonicalTeamName(teamCity, teamName);

    try {
      const existing = await storage.getTeamRecord(team, season);
      if (existing) {
        await storage.updateTeamRecord(team, season, { wins: w, losses: l });
        result.updated++;
      } else {
        await storage.createTeamRecord({ team, season, wins: w, losses: l, league: "NBA" });
        result.inserted++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${team}: ${msg}`);
    }
  }

  return result;
}

/**
 * Fetch current season standings from stats.nba.com and upsert into team_records.
 * Runs daily to keep current season W-L up to date.
 */
export async function updateCurrentSeasonStandings(): Promise<StandingsUpdateResult> {
  return fetchStandingsForSeason(getCurrentSeasonForStandings());
}

export interface AllSeasonsStandingsResult {
  seasons: { season: string; updated: number; inserted: number; errors: string[] }[];
  totalUpdated: number;
  totalInserted: number;
}

/**
 * Fetch standings for all seasons (current + historical) that the roster dropdown shows,
 * and upsert each into team_records. Use at startup or via script when API is reachable.
 */
export async function updateStandingsForAllSeasons(): Promise<AllSeasonsStandingsResult> {
  const seasons = getStandingsSeasonStrings();
  const results: AllSeasonsStandingsResult["seasons"] = [];
  let totalUpdated = 0;
  let totalInserted = 0;
  for (let i = 0; i < seasons.length; i++) {
    const season = seasons[i];
    const result = await fetchStandingsForSeason(season);
    results.push({ season, updated: result.updated, inserted: result.inserted, errors: result.errors });
    totalUpdated += result.updated;
    totalInserted += result.inserted;
    if (result.errors.length > 0 && result.updated === 0 && result.inserted === 0) {
      break;
    }
    if (i < seasons.length - 1) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  return { seasons: results, totalUpdated, totalInserted };
}

/** Apply standings from a simple list (e.g. from manual POST or another API). Upserts into team_records. */
export async function applyStandings(
  season: string,
  entries: { team: string; wins: number; losses: number }[]
): Promise<StandingsUpdateResult> {
  const result: StandingsUpdateResult = { season, updated: 0, inserted: 0, errors: [] };
  for (const { team, wins, losses } of entries) {
    const t = (team ?? "").trim();
    if (!t) continue;
    try {
      const existing = await storage.getTeamRecord(t, season);
      if (existing) {
        await storage.updateTeamRecord(t, season, { wins, losses });
        result.updated++;
      } else {
        await storage.createTeamRecord({ team: t, season, wins, losses, league: "NBA" });
        result.inserted++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${t}: ${msg}`);
    }
  }
  return result;
}
