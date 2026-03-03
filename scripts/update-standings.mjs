#!/usr/bin/env node
/**
 * Run from your machine (not Railway) to fetch current NBA standings from stats.nba.com
 * and POST them to your Hoop Central API. Use when the automatic daily fetch fails on Railway.
 *
 * Usage:
 *   API_URL=https://hoop-central-production.up.railway.app node scripts/update-standings.mjs
 *   # or
 *   node scripts/update-standings.mjs  # uses http://localhost:5000 if PORT not set
 */

const API_BASE = process.env.API_URL || `http://localhost:${process.env.PORT || "5000"}`;
const SEASON = process.env.SEASON || "2025-26";

const TEAM_CANONICAL = {
  "Los Angeles Clippers": "LA Clippers",
};

function canonical(teamCity, teamName) {
  const combined = `${(teamCity || "").trim()} ${(teamName || "").trim()}`.trim();
  return TEAM_CANONICAL[combined] || combined;
}

async function main() {
  const url = `https://stats.nba.com/stats/leaguestandingsv3?LeagueID=00&Season=${encodeURIComponent(SEASON)}&SeasonType=Regular%20Season`;
  console.log("Fetching standings from stats.nba.com for", SEASON, "...");
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Referer: "https://www.nba.com/",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  if (!res.ok) {
    console.error("NBA API returned", res.status, res.statusText);
    process.exit(1);
  }
  const data = await res.json();
  const rs = data?.resultSets?.[0];
  if (!rs || !Array.isArray(rs.headers) || !Array.isArray(rs.rowSet)) {
    console.error("Unexpected response shape");
    process.exit(1);
  }
  const headers = rs.headers;
  const idxTeamCity = headers.findIndex((h) => h === "TeamCity" || h === "TEAM_CITY");
  const idxTeamName = headers.findIndex((h) => h === "TeamName" || h === "TEAM_NAME");
  const idxW = headers.findIndex((h) => h === "W" || h === "WINS");
  const idxL = headers.findIndex((h) => h === "L" || h === "LOSSES");
  if ([idxTeamCity, idxTeamName, idxW, idxL].some((i) => i === -1)) {
    console.error("Missing columns:", headers);
    process.exit(1);
  }
  const standings = rs.rowSet.map((row) => ({
    team: canonical(String(row[idxTeamCity] ?? ""), String(row[idxTeamName] ?? "")),
    wins: parseInt(String(row[idxW] ?? "0"), 10),
    losses: parseInt(String(row[idxL] ?? "0"), 10),
  }));
  console.log("Posting", standings.length, "teams to", API_BASE, "...");
  const post = await fetch(`${API_BASE}/api/standings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ season: SEASON, standings }),
  });
  if (!post.ok) {
    console.error("API returned", post.status, await post.text());
    process.exit(1);
  }
  const result = await post.json();
  console.log("Done:", result.updated, "updated,", result.inserted, "inserted.");
  if (result.errors?.length) console.warn("Errors:", result.errors);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
