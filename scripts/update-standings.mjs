#!/usr/bin/env node
/**
 * Fetch NBA standings from stats.nba.com for one or more seasons and POST to your Hoop Central API.
 * Run from your machine (not Railway) when the server-side fetch is blocked.
 *
 * Usage:
 *   API_URL=https://hoop-central-production.up.railway.app node scripts/update-standings.mjs
 *   # All seasons (default):
 *   node scripts/update-standings.mjs
 *   # Single season:
 *   SEASON=2024-25 node scripts/update-standings.mjs
 *   # Comma-separated seasons (start years):
 *   SEASONS=2025,2024,2023,2022,2021,2020 node scripts/update-standings.mjs
 */

const API_BASE = process.env.API_URL || `http://localhost:${process.env.PORT || "5000"}`;

const SEASON_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2018, 1997, 1995, 1992, 1987];
function formatSeason(year) {
  const next = String(year + 1).slice(-2);
  return `${year}-${next}`;
}
function getSeasonsToFetch() {
  if (process.env.SEASON) {
    const s = process.env.SEASON.trim();
    return [s.includes("-") ? s : formatSeason(parseInt(s, 10))];
  }
  if (process.env.SEASONS) {
    return process.env.SEASONS.split(",").map((y) => formatSeason(parseInt(y.trim(), 10)));
  }
  return SEASON_YEARS.map(formatSeason);
}

const TEAM_CANONICAL = {
  "Los Angeles Clippers": "LA Clippers",
};

function canonical(teamCity, teamName) {
  const combined = `${(teamCity || "").trim()} ${(teamName || "").trim()}`.trim();
  return TEAM_CANONICAL[combined] || combined;
}

async function fetchSeason(season) {
  const url = `https://stats.nba.com/stats/leaguestandingsv3?LeagueID=00&Season=${encodeURIComponent(season)}&SeasonType=Regular%20Season`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Referer: "https://www.nba.com/",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`${season}: API ${res.status} ${res.statusText}`);
  const data = await res.json();
  const rs = data?.resultSets?.[0];
  if (!rs || !Array.isArray(rs.headers) || !Array.isArray(rs.rowSet)) throw new Error(`${season}: unexpected response`);
  const headers = rs.headers;
  const idxTeamCity = headers.findIndex((h) => h === "TeamCity" || h === "TEAM_CITY");
  const idxTeamName = headers.findIndex((h) => h === "TeamName" || h === "TEAM_NAME");
  const idxW = headers.findIndex((h) => h === "W" || h === "WINS");
  const idxL = headers.findIndex((h) => h === "L" || h === "LOSSES");
  if ([idxTeamCity, idxTeamName, idxW, idxL].some((i) => i === -1)) throw new Error(`${season}: missing columns`);
  return rs.rowSet.map((row) => ({
    team: canonical(String(row[idxTeamCity] ?? ""), String(row[idxTeamName] ?? "")),
    wins: parseInt(String(row[idxW] ?? "0"), 10),
    losses: parseInt(String(row[idxL] ?? "0"), 10),
  }));
}

async function main() {
  const seasons = getSeasonsToFetch();
  console.log("Seasons to fetch:", seasons.join(", "));
  let totalUpdated = 0;
  let totalInserted = 0;
  for (let i = 0; i < seasons.length; i++) {
    const season = seasons[i];
    try {
      const standings = await fetchSeason(season);
      const post = await fetch(`${API_BASE}/api/standings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, standings }),
      });
      if (!post.ok) {
        console.error(season, "API", post.status, await post.text());
        continue;
      }
      const result = await post.json();
      totalUpdated += result.updated ?? 0;
      totalInserted += result.inserted ?? 0;
      console.log(season, "->", result.updated, "updated,", result.inserted, "inserted.");
    } catch (err) {
      console.error(season, err.message);
    }
    if (i < seasons.length - 1) await new Promise((r) => setTimeout(r, 800));
  }
  console.log("Done. Total:", totalUpdated, "updated,", totalInserted, "inserted.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
