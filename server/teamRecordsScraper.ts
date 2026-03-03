/**
 * Scrapes team W-L records from basketball-reference.com standings pages
 * (same idea as the player scraper) and upserts into team_records for display on the site.
 */

import { storage } from "./storage";
import { getStandingsSeasonStrings } from "./standings";

/** Basketball-Reference uses end year in URL: 2025-26 season -> NBA_2026_standings.html */
function seasonToBasketballRefYear(season: string): number {
  const m = season.match(/^(\d{4})-(\d{2})$/);
  if (m) return parseInt(m[1], 10) + 1;
  const y = parseInt(season, 10);
  if (!Number.isNaN(y)) return y + 1;
  return new Date().getFullYear() + 1;
}

/** Map BR team name to our canonical name (e.g. roster page expects "LA Clippers"). */
const BR_TEAM_TO_CANONICAL: Record<string, string> = {
  "Los Angeles Clippers": "LA Clippers",
};

function canonicalTeamName(brName: string): string {
  const t = (brName || "").trim();
  return BR_TEAM_TO_CANONICAL[t] || t;
}

/**
 * Parse one standings HTML page: extract team name and W, L from each row that has a team link.
 * BR conference table: rank (optional), team link, W, L, ... so we take the last two numeric tds in the row as W-L.
 */
function parseStandingsTable(html: string): { team: string; wins: number; losses: number }[] {
  const rows = html.split(/<\/tr>/i);
  const results: { team: string; wins: number; losses: number }[] = [];
  const teamLinkRe = /<a href="\/teams\/[A-Z]+\/\d+\.html"[^>]*>([^<]+)<\/a>/i;
  const tdNumRe = /<td[^>]*>\s*(\d+)\s*<\/td>/g;

  for (const row of rows) {
    const linkMatch = row.match(teamLinkRe);
    if (!linkMatch) continue;
    const teamName = linkMatch[1].trim();
    tdNumRe.lastIndex = 0;
    const numbers: number[] = [];
    let m;
    while ((m = tdNumRe.exec(row)) !== null) numbers.push(parseInt(m[1], 10));
    if (numbers.length >= 2) {
      const wins = numbers.length >= 3 ? numbers[1] : numbers[0];
      const losses = numbers.length >= 3 ? numbers[2] : numbers[1];
      results.push({
        team: canonicalTeamName(teamName),
        wins,
        losses,
      });
    }
  }

  return results;
}

export interface TeamRecordsScraperResult {
  season: string;
  fetched: number;
  updated: number;
  inserted: number;
  errors: string[];
}

/**
 * Fetch one season's standings from basketball-reference.com and upsert into team_records.
 */
export async function scrapeTeamRecordsForSeason(season: string): Promise<TeamRecordsScraperResult> {
  const result: TeamRecordsScraperResult = { season, fetched: 0, updated: 0, inserted: 0, errors: [] };
  const year = seasonToBasketballRefYear(season);
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}_standings.html`;

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      result.errors.push(`HTTP ${res.status}`);
      return result;
    }
    html = await res.text();
  } catch (err: unknown) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }

  const entries = parseStandingsTable(html);
  result.fetched = entries.length;

  const seen = new Set<string>();
  for (const { team, wins, losses } of entries) {
    if (seen.has(team)) continue;
    seen.add(team);
    try {
      const existing = await storage.getTeamRecord(team, season);
      if (existing) {
        await storage.updateTeamRecord(team, season, { wins, losses });
        result.updated++;
      } else {
        await storage.createTeamRecord({ team, season, wins, losses, league: "NBA" });
        result.inserted++;
      }
    } catch (err: unknown) {
      result.errors.push(`${team}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

export interface TeamRecordsScraperFullResult {
  seasons: TeamRecordsScraperResult[];
  totalUpdated: number;
  totalInserted: number;
}

/**
 * Scrape team records from basketball-reference for all seasons we show on the roster dropdown.
 */
export async function scrapeAllTeamRecordsFromBR(): Promise<TeamRecordsScraperFullResult> {
  const seasons = getStandingsSeasonStrings();
  const results: TeamRecordsScraperResult[] = [];
  let totalUpdated = 0;
  let totalInserted = 0;

  for (let i = 0; i < seasons.length; i++) {
    const season = seasons[i];
    const r = await scrapeTeamRecordsForSeason(season);
    results.push(r);
    totalUpdated += r.updated;
    totalInserted += r.inserted;
    if (r.errors.length > 0 && r.fetched === 0) break;
    if (i < seasons.length - 1) await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  return { seasons: results, totalUpdated, totalInserted };
}
